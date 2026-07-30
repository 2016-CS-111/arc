import type { ChatCancelCommand, ChatError, ChatSendCommand, ConversationMessage } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import { ActiveGenerationRegistry } from "../../../../ai-server/src/modules/chat/application/active-generation.registry.js";
import type {
  DurableChatPreparation,
  DurableChatService,
} from "../../../../ai-server/src/modules/chat/application/durable-chat.service.js";
import { SendChatMessageService } from "../../../../ai-server/src/modules/chat/application/send-chat-message.service.js";
import type { ChatPromptService } from "../../../../ai-server/src/modules/context/application/chat-prompt.service.js";
import { ChatModelError } from "../../../../ai-server/src/modules/inference/domain/chat-model.errors.js";
import type {
  ChatModelEvent,
  ChatModelRequest,
  ChatModelStatus,
} from "../../../../ai-server/src/modules/inference/domain/chat-model.types.js";
import type { ChatModelPort } from "../../../../ai-server/src/modules/inference/application/chat-model.port.js";
import { ChatGateway } from "../../../../ai-server/src/modules/chat/presentation/chat.gateway.js";
import type { ChatSocket } from "../../../../ai-server/src/modules/chat/presentation/chat.socket.js";
import { ChatSessionController } from "./ChatSessionController.js";
import type { ChatTransportEvent, ChatTransportPort, ChatTransportSubscription } from "./ChatTransportPort.js";
import { InMemoryChatSessionController } from "./InMemoryChatSessionController.js";
import type { ChatConnectionStatus } from "./chatWebview.contract.js";

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};

type ModelStream = (signal: AbortSignal | undefined) => AsyncIterable<ChatModelEvent>;
type TransportPayload<T extends ChatTransportEvent["type"]> =
  Extract<ChatTransportEvent, { readonly type: T }> extends { readonly payload: infer Payload } ? Payload : never;

const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";
const assistantMessageId = "1d089847-4de9-41c0-af93-3d7411a6068e";
const timestamp = "2026-07-18T12:00:00.000Z";

class InMemoryDurableChatService {
  private assistantMessage: ConversationMessage | undefined;

  public prepare(command: ChatSendCommand): Promise<DurableChatPreparation> {
    this.assistantMessage = this.createAssistantMessage(command, "pending", "");
    return Promise.resolve({
      type: "new",
      assistantMessage: this.assistantMessage,
      modelMessages: [{ role: "user", content: command.content }],
    });
  }

  public stream(sessionIdToUpdate: string, requestId: string, content: string): Promise<ConversationMessage> {
    this.assistantMessage = this.createAssistantMessage(
      { sessionId: sessionIdToUpdate, requestId, content: "" },
      "streaming",
      content,
    );
    return Promise.resolve(this.assistantMessage);
  }

  public complete(sessionIdToUpdate: string, requestId: string, content: string): Promise<ConversationMessage> {
    this.assistantMessage = this.createAssistantMessage(
      { sessionId: sessionIdToUpdate, requestId, content: "" },
      "completed",
      content,
    );
    return Promise.resolve(this.assistantMessage);
  }

  public cancel(sessionIdToUpdate: string, requestId: string, content: string): Promise<ConversationMessage> {
    this.assistantMessage = this.createAssistantMessage(
      { sessionId: sessionIdToUpdate, requestId, content: "" },
      "cancelled",
      content,
    );
    return Promise.resolve(this.assistantMessage);
  }

  public fail(
    sessionIdToUpdate: string,
    requestId: string,
    content: string,
    error: ChatError,
  ): Promise<ConversationMessage> {
    this.assistantMessage = this.createAssistantMessage(
      { sessionId: sessionIdToUpdate, requestId, content: "" },
      "failed",
      content,
      error,
    );
    return Promise.resolve(this.assistantMessage);
  }

  private createAssistantMessage(
    command: ChatSendCommand,
    status: ConversationMessage["status"],
    content: string,
    error?: ChatError,
  ): ConversationMessage {
    return {
      id: assistantMessageId,
      sessionId: command.sessionId,
      requestId: command.requestId,
      ordinal: 2,
      role: "assistant",
      status,
      content,
      ...(error === undefined ? {} : { error }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}

class InProcessGatewayTransport implements ChatTransportPort {
  public readonly cancelled: ChatCancelCommand[] = [];
  public connectionStatus: ChatConnectionStatus = "idle";
  public readonly sent: ChatSendCommand[] = [];

  private readonly gateway: ChatGateway;
  private readonly listeners = new Set<(event: ChatTransportEvent) => void>();
  private readonly socket: ChatSocket;

  public constructor(stream: ModelStream) {
    const chatModel: ChatModelPort = {
      getStatus: (): Promise<ChatModelStatus> =>
        Promise.resolve({
          latencyMs: 1,
          model: "deterministic-model",
          status: "ready",
        }),
      streamChat: (request: ChatModelRequest, signal?: AbortSignal): AsyncIterable<ChatModelEvent> => {
        void request;
        return stream(signal);
      },
    };

    this.gateway = new ChatGateway(
      new ActiveGenerationRegistry(),
      new InMemoryDurableChatService() as unknown as DurableChatService,
      {
        build: (request) =>
          Promise.resolve({
            estimatedHistoryTokens: 0,
            estimatedInputTokens: 0,
            estimatedProjectTokens: 0,
            messages: request.messages,
          }),
      } as ChatPromptService,
      new SendChatMessageService(chatModel),
      logger,
    );
    this.socket = {
      id: "in-process-client",
      emit: (eventName: string, payload: unknown): boolean => {
        this.forwardGatewayEvent(eventName, payload);
        return true;
      },
    };
  }

  public connect(): void {
    this.updateConnectionStatus("connecting");
    this.updateConnectionStatus("connected");
  }

  public send(command: ChatSendCommand): void {
    this.sent.push(command);
    this.gateway.handleChatSend(this.socket, command);
  }

  public cancel(command: ChatCancelCommand): void {
    this.cancelled.push(command);
    this.gateway.handleChatCancel(this.socket, command);
  }

  public subscribe(listener: (event: ChatTransportEvent) => void): ChatTransportSubscription {
    this.listeners.add(listener);
    return {
      dispose: (): void => {
        this.listeners.delete(listener);
      },
    };
  }

  public dispose(): void {
    this.listeners.clear();
  }

  private forwardGatewayEvent(eventName: string, payload: unknown): void {
    switch (eventName) {
      case "chat:accepted":
        this.emit({ payload: payload as TransportPayload<"accepted">, type: "accepted" });
        return;
      case "chat:delta":
        this.emit({ payload: payload as TransportPayload<"delta">, type: "delta" });
        return;
      case "chat:completed":
        this.emit({ payload: payload as TransportPayload<"completed">, type: "completed" });
        return;
      case "chat:cancelled":
        this.emit({ payload: payload as TransportPayload<"cancelled">, type: "cancelled" });
        return;
      case "chat:error":
        this.emit({ payload: payload as TransportPayload<"error">, type: "error" });
        return;
      default:
        return;
    }
  }

  private emit(event: ChatTransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private updateConnectionStatus(status: ChatConnectionStatus): void {
    this.connectionStatus = status;
    this.emit({ status, type: "connection-status" });
  }
}

function createSession(): InMemoryChatSessionController {
  const identifiers = [sessionId, "request-1", "assistant-1", "user-1"];

  return new InMemoryChatSessionController({
    createId: (): string => {
      const identifier = identifiers.shift();
      if (identifier === undefined) {
        throw new Error("No test identifier remains.");
      }

      return identifier;
    },
    now: (): string => "2026-07-18T12:00:00.000Z",
  });
}

describe("Arc chat flow integration", () => {
  it("streams deterministic backend tokens into the extension-host session", async () => {
    const transport = new InProcessGatewayTransport(async function* (): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      yield { content: "Arc ", type: "delta" };
      yield { content: "is streaming.", type: "delta" };
      yield { finishReason: "stop", type: "completed" };
    });
    const controller = new ChatSessionController({ session: createSession(), transport });

    controller.connect();
    controller.submit("Confirm streaming");

    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toMatchObject({ activeGeneration: null });
      expect(controller.getSnapshot().messages[1]).toMatchObject({
        content: "Arc is streaming.",
        status: "completed",
      });
    });
    expect(transport.sent).toEqual([
      {
        content: "Confirm streaming",
        requestId: "request-1",
        sessionId,
      },
    ]);
  });

  it("cancels an in-flight backend generation exactly once", async () => {
    const transport = new InProcessGatewayTransport(async function* (
      signal: AbortSignal | undefined,
    ): AsyncGenerator<ChatModelEvent> {
      if (signal?.aborted) {
        throw new ChatModelError("GENERATION_CANCELLED", "Generation was cancelled.");
      }
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", resolve, { once: true });
      });
      const noEvents: ChatModelEvent[] = [];
      yield* noEvents;
      throw new ChatModelError("GENERATION_CANCELLED", "Generation was cancelled.");
    });
    const controller = new ChatSessionController({ session: createSession(), transport });

    controller.connect();
    controller.submit("Cancel this request");
    controller.cancelActiveGeneration();

    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toMatchObject({ activeGeneration: null });
      expect(controller.getSnapshot().messages[1]).toMatchObject({ status: "cancelled" });
    });
    expect(transport.cancelled).toEqual([{ requestId: "request-1", sessionId }]);
  });

  it("exposes a backend timeout as a retryable terminal message", async () => {
    const transport = new InProcessGatewayTransport(async function* (): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      const noEvents: ChatModelEvent[] = [];
      yield* noEvents;
      throw new ChatModelError("OLLAMA_TIMEOUT", "The model timed out.");
    });
    const controller = new ChatSessionController({ session: createSession(), transport });

    controller.connect();
    controller.submit("Time out");

    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toMatchObject({ activeGeneration: null });
      expect(controller.getSnapshot().messages[1]).toMatchObject({
        error: { code: "generation_timeout", retryable: true },
        status: "failed",
      });
    });
  });
});
