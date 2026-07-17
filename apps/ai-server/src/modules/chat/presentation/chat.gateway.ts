import {
  ChatAcceptedEventSchema,
  ChatCancelCommandSchema,
  ChatCancelledEventSchema,
  ChatCompletedEventSchema,
  ChatDeltaEventSchema,
  ChatErrorEventSchema,
  ChatSendCommandSchema,
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
import { ActiveGenerationRegistry } from "../application/active-generation.registry.js";
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
    @Inject(SendChatMessageService)
    private readonly sendChatMessageService: SendChatMessageService,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
  ) {}

  @SubscribeMessage("chat:send")
  public handleChatSend(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: unknown,
  ): void {
    const parsedCommand = ChatSendCommandSchema.safeParse(payload);
    if (!parsedCommand.success) {
      const correlation = this.extractCorrelation(payload);
      this.emitError(
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
      this.emitError(
        client,
        command.requestId,
        command.sessionId,
        createChatError(
          "session_busy",
          "A response is already being generated for this session.",
          true,
        ),
      );
      return;
    }

    client.emit(
      "chat:accepted",
      ChatAcceptedEventSchema.parse({
        requestId: command.requestId,
        sessionId: command.sessionId,
      }),
    );

    void this.streamResponse(client, command, scope, controller.signal);
  }

  @SubscribeMessage("chat:cancel")
  public handleChatCancel(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: unknown,
  ): void {
    const parsedCommand = ChatCancelCommandSchema.safeParse(payload);
    if (!parsedCommand.success) {
      const correlation = this.extractCorrelation(payload);
      this.emitError(
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
      this.emitError(
        client,
        command.requestId,
        command.sessionId,
        createChatError(
          "generation_not_found",
          "No active generation matches this request.",
          false,
        ),
      );
    }
  }

  public handleDisconnect(client: ChatSocket): void {
    this.activeGenerationRegistry.cancelAllForClient(client.id);
    this.logger.info("Chat client disconnected", { socketId: client.id });
  }

  private async streamResponse(
    client: ChatSocket,
    command: ChatSendCommand,
    scope: GenerationScope,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      for await (const event of this.sendChatMessageService.stream(command, signal)) {
        if (event.type === "delta") {
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

        client.emit(
          "chat:completed",
          ChatCompletedEventSchema.parse({
            requestId: command.requestId,
            sessionId: command.sessionId,
            ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
            ...(event.usage === undefined ? {} : { usage: event.usage }),
          }),
        );
      }
    } catch (error) {
      const chatError = toChatError(error);

      if (chatError.code === "generation_cancelled") {
        client.emit(
          "chat:cancelled",
          ChatCancelledEventSchema.parse({
            requestId: command.requestId,
            sessionId: command.sessionId,
          }),
        );
      } else {
        this.emitError(client, command.requestId, command.sessionId, chatError);
      }
    } finally {
      this.activeGenerationRegistry.complete(scope);
    }
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
    return typeof value === "string" && value.length > 0 ? value : "unknown";
  }
}
