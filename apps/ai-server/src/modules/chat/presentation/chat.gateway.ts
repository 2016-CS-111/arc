import {
  ChatAcceptedEventSchema,
  ChatCancelCommandSchema,
  ChatCancelledEventSchema,
  ChatCompletedEventSchema,
  ChatDeltaEventSchema,
  ChatErrorEventSchema,
  ChatSendCommandSchema,
  type ChatError,
  type ChatSendCommand,
} from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayDisconnect,
} from "@nestjs/websockets";

import { ARC_LOGGER } from "../../logger/logger.constants.js";
import { ChatPromptService } from "../../context/application/chat-prompt.service.js";
import type { ChatModelMessage } from "../../inference/domain/chat-model.types.js";
import { ActiveGenerationRegistry } from "../application/active-generation.registry.js";
import { ChatGenerationLifecycleLogger } from "../application/chat-generation-lifecycle.logger.js";
import { DurableChatService, type DurableChatPreparation } from "../application/durable-chat.service.js";
import { SendChatMessageService } from "../application/send-chat-message.service.js";
import { createChatError, toChatError } from "../domain/chat.errors.js";
import type { GenerationScope } from "../domain/chat.types.js";
import type { ChatSocket } from "./chat.socket.js";

@WebSocketGateway({
  namespace: "/chat",
  cors: {
    origin: "*",
  },
})
export class ChatGateway implements OnGatewayDisconnect {
  public constructor(
    @Inject(ActiveGenerationRegistry)
    private readonly activeGenerationRegistry: ActiveGenerationRegistry,
    @Inject(DurableChatService)
    private readonly durableChatService: DurableChatService,
    @Inject(ChatPromptService)
    private readonly chatPromptService: ChatPromptService,
    @Inject(SendChatMessageService)
    private readonly sendChatMessageService: SendChatMessageService,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
  ) {}

  @SubscribeMessage("chat:send")
  public handleChatSend(@ConnectedSocket() client: ChatSocket, @MessageBody() payload: unknown): void {
    const parsedCommand = ChatSendCommandSchema.safeParse(payload);
    if (!parsedCommand.success) {
      const correlation = this.extractCorrelation(payload);
      this.rejectRequest(
        client,
        correlation.requestId,
        correlation.sessionId,
        createChatError("invalid_request", "The chat request is invalid.", false),
      );
      return;
    }

    const command = parsedCommand.data;
    const scope: GenerationScope = {
      clientId: client.id,
      requestId: command.requestId,
      sessionId: command.sessionId,
    };
    const controller = this.activeGenerationRegistry.start(scope);

    if (controller === undefined) {
      this.rejectRequest(
        client,
        command.requestId,
        command.sessionId,
        createChatError("session_busy", "A response is already being generated for this session.", true),
      );
      return;
    }

    const lifecycle = new ChatGenerationLifecycleLogger(this.logger, {
      requestId: command.requestId,
      sessionId: command.sessionId,
    });
    lifecycle.started();
    void this.prepareAndStream(client, command, scope, controller.signal, lifecycle);
  }

  @SubscribeMessage("chat:cancel")
  public handleChatCancel(@ConnectedSocket() client: ChatSocket, @MessageBody() payload: unknown): void {
    const parsedCommand = ChatCancelCommandSchema.safeParse(payload);
    if (!parsedCommand.success) {
      const correlation = this.extractCorrelation(payload);
      this.rejectRequest(
        client,
        correlation.requestId,
        correlation.sessionId,
        createChatError("invalid_request", "The cancellation request is invalid.", false),
      );
      return;
    }

    const command = parsedCommand.data;
    const cancelled = this.activeGenerationRegistry.cancel({
      clientId: client.id,
      requestId: command.requestId,
      sessionId: command.sessionId,
    });

    if (!cancelled) {
      this.rejectRequest(
        client,
        command.requestId,
        command.sessionId,
        createChatError("generation_not_found", "No active generation matches this request.", false),
      );
      return;
    }

    this.logger.info("Chat generation cancellation requested", {
      requestId: command.requestId,
      sessionId: command.sessionId,
      status: "cancellation_requested",
    });
  }

  public handleDisconnect(client: ChatSocket): void {
    this.activeGenerationRegistry.cancelAllForClient(client.id);
    this.logger.info("Chat client disconnected", { socketId: client.id });
  }

  private async prepareAndStream(
    client: ChatSocket,
    command: ChatSendCommand,
    scope: GenerationScope,
    signal: AbortSignal,
    lifecycle: ChatGenerationLifecycleLogger,
  ): Promise<void> {
    try {
      const preparation = await this.durableChatService.prepare(command);
      client.emit(
        "chat:accepted",
        ChatAcceptedEventSchema.parse({
          requestId: command.requestId,
          sessionId: command.sessionId,
        }),
      );
      lifecycle.accepted(preparation.type);

      if (preparation.type === "existing") {
        await this.replayExistingGeneration(client, command, preparation, lifecycle);
        return;
      }

      const prompt = await this.chatPromptService.build(
        {
          messages: preparation.modelMessages,
          ...(command.projectId === undefined ? {} : { projectId: command.projectId }),
          requestId: command.requestId,
          sessionId: command.sessionId,
        },
        signal,
      );
      await this.streamResponse(client, command, preparation, prompt.messages, signal, lifecycle);
    } catch (error) {
      const chatError = toChatError(error);
      if (chatError.code === "generation_cancelled") {
        await this.persistCancellation(command, "");
        client.emit(
          "chat:cancelled",
          ChatCancelledEventSchema.parse({
            requestId: command.requestId,
            sessionId: command.sessionId,
          }),
        );
        lifecycle.cancelled();
      } else {
        await this.persistFailure(command, "", chatError);
        this.emitError(client, command.requestId, command.sessionId, chatError);
        lifecycle.failed(chatError.code);
      }
    } finally {
      this.activeGenerationRegistry.complete(scope);
    }
  }

  private async streamResponse(
    client: ChatSocket,
    command: ChatSendCommand,
    preparation: Extract<DurableChatPreparation, { readonly type: "new" }>,
    modelMessages: readonly ChatModelMessage[],
    signal: AbortSignal,
    lifecycle: ChatGenerationLifecycleLogger,
  ): Promise<void> {
    let assistantContent = preparation.assistantMessage.content;

    try {
      for await (const event of this.sendChatMessageService.stream(
        {
          messages: modelMessages,
          requestId: command.requestId,
          sessionId: command.sessionId,
          ...(command.projectId === undefined ? {} : { projectId: command.projectId }),
        },
        signal,
      )) {
        if (event.type === "delta") {
          assistantContent += event.content;
          const persisted = await this.durableChatService.stream(
            command.sessionId,
            command.requestId,
            assistantContent,
          );
          if (persisted === undefined) {
            throw new Error("Arc could not persist an assistant response delta.");
          }

          client.emit(
            "chat:delta",
            ChatDeltaEventSchema.parse({
              requestId: command.requestId,
              sessionId: command.sessionId,
              content: event.content,
            }),
          );
          continue;
        }

        const persisted = await this.durableChatService.complete(
          command.sessionId,
          command.requestId,
          assistantContent,
        );
        if (persisted === undefined) {
          throw new Error("Arc could not complete the persisted assistant response.");
        }

        client.emit(
          "chat:completed",
          ChatCompletedEventSchema.parse({
            requestId: command.requestId,
            sessionId: command.sessionId,
            ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
            ...(event.usage === undefined ? {} : { usage: event.usage }),
          }),
        );
        lifecycle.completed();
      }
    } catch (error) {
      const chatError = toChatError(error);

      if (chatError.code === "generation_cancelled") {
        await this.persistCancellation(command, assistantContent);
        client.emit(
          "chat:cancelled",
          ChatCancelledEventSchema.parse({
            requestId: command.requestId,
            sessionId: command.sessionId,
          }),
        );
        lifecycle.cancelled();
      } else {
        await this.persistFailure(command, assistantContent, chatError);
        this.emitError(client, command.requestId, command.sessionId, chatError);
        lifecycle.failed(chatError.code);
      }
    }
  }

  private async replayExistingGeneration(
    client: ChatSocket,
    command: ChatSendCommand,
    preparation: Extract<DurableChatPreparation, { readonly type: "existing" }>,
    lifecycle: ChatGenerationLifecycleLogger,
  ): Promise<void> {
    const assistantMessage = preparation.assistantMessage;

    switch (assistantMessage.status) {
      case "completed":
        if (assistantMessage.content.length > 0) {
          client.emit(
            "chat:delta",
            ChatDeltaEventSchema.parse({
              requestId: command.requestId,
              sessionId: command.sessionId,
              content: assistantMessage.content,
            }),
          );
        }
        client.emit(
          "chat:completed",
          ChatCompletedEventSchema.parse({
            requestId: command.requestId,
            sessionId: command.sessionId,
          }),
        );
        lifecycle.completed();
        return;
      case "cancelled":
        client.emit(
          "chat:cancelled",
          ChatCancelledEventSchema.parse({
            requestId: command.requestId,
            sessionId: command.sessionId,
          }),
        );
        lifecycle.cancelled();
        return;
      case "failed": {
        const error = assistantMessage.error ?? this.createInterruptedGenerationError();
        this.emitError(client, command.requestId, command.sessionId, error);
        lifecycle.failed(error.code);
        return;
      }
      case "pending":
      case "streaming": {
        const error = this.createInterruptedGenerationError();
        await this.persistFailure(command, assistantMessage.content, error);
        this.emitError(client, command.requestId, command.sessionId, error);
        lifecycle.failed(error.code);
      }
    }
  }

  private async persistCancellation(command: ChatSendCommand, assistantContent: string): Promise<void> {
    try {
      const persisted = await this.durableChatService.cancel(command.sessionId, command.requestId, assistantContent);
      if (persisted === undefined) {
        this.logger.warn("Arc generation cancellation was already terminal", {
          requestId: command.requestId,
          sessionId: command.sessionId,
        });
      }
    } catch (error) {
      this.logger.error("Could not persist Arc generation cancellation", {
        errorType: getErrorType(error),
        requestId: command.requestId,
        sessionId: command.sessionId,
      });
    }
  }

  private async persistFailure(command: ChatSendCommand, assistantContent: string, error: ChatError): Promise<void> {
    try {
      const persisted = await this.durableChatService.fail(
        command.sessionId,
        command.requestId,
        assistantContent,
        error,
      );
      if (persisted === undefined) {
        this.logger.warn("Arc generation failure was already terminal", {
          requestId: command.requestId,
          sessionId: command.sessionId,
        });
      }
    } catch (persistenceError) {
      this.logger.error("Could not persist Arc generation failure", {
        errorType: getErrorType(persistenceError),
        requestId: command.requestId,
        sessionId: command.sessionId,
      });
    }
  }

  private createInterruptedGenerationError(): ChatError {
    return createChatError(
      "generation_failed",
      "The previous Arc generation was interrupted before it completed.",
      true,
    );
  }

  private emitError(
    client: ChatSocket,
    requestId: string,
    sessionId: string,
    error: ReturnType<typeof createChatError>,
  ): void {
    client.emit(
      "chat:error",
      ChatErrorEventSchema.parse({
        requestId,
        sessionId,
        error,
      }),
    );
  }

  private rejectRequest(client: ChatSocket, requestId: string, sessionId: string, error: ChatError): void {
    this.logger.warn("Chat request rejected", {
      errorCode: error.code,
      requestId,
      sessionId,
      status: "rejected",
    });
    this.emitError(client, requestId, sessionId, error);
  }

  private extractCorrelation(payload: unknown): { requestId: string; sessionId: string } {
    if (typeof payload !== "object" || payload === null) {
      return {
        requestId: "unknown",
        sessionId: "unknown",
      };
    }

    const candidate = payload as Record<string, unknown>;

    return {
      requestId: this.getStringField(candidate, "requestId"),
      sessionId: this.getStringField(candidate, "sessionId"),
    };
  }

  private getStringField(candidate: Record<string, unknown>, field: string): string {
    const value = candidate[field];
    return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value) ? value : "unknown";
  }
}

function getErrorType(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)) {
    return error.name;
  }

  return "UnknownError";
}
