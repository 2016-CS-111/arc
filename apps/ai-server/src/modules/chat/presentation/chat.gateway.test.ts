import type { ChatError, ChatSendCommand, ConversationMessage } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import type { ChatPromptService } from "../../context/application/chat-prompt.service.js";
import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import { ChatModelError } from "../../inference/domain/chat-model.errors.js";
import type { ChatModelEvent, ChatModelRequest, ChatModelStatus } from "../../inference/domain/chat-model.types.js";
import { ActiveGenerationRegistry } from "../application/active-generation.registry.js";
import type { DurableChatPreparation, DurableChatService } from "../application/durable-chat.service.js";
import { SendChatMessageService } from "../application/send-chat-message.service.js";
import { ChatGateway } from "./chat.gateway.js";
import type { ChatSocket } from "./chat.socket.js";

interface EmittedEvent {
  readonly event: string;
  readonly payload: unknown;
}

interface TestSocket extends ChatSocket {
  readonly emitted: EmittedEvent[];
}

interface CapturedLogEntry {
  readonly context: Readonly<Record<string, unknown>> | undefined;
  readonly level: keyof Logger;
  readonly message: string;
}

const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";
const assistantMessageId = "1d089847-4de9-41c0-af93-3d7411a6068e";
const timestamp = "2026-07-18T12:00:00.000Z";

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};

class CapturedLogger implements Logger {
  public readonly entries: CapturedLogEntry[] = [];

  public debug(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.capture("debug", message, context);
  }

  public error(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.capture("error", message, context);
  }

  public info(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.capture("info", message, context);
  }

  public warn(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.capture("warn", message, context);
  }

  private capture(level: keyof Logger, message: string, context?: Readonly<Record<string, unknown>>): void {
    this.entries.push({ context, level, message });
  }
}

const command: ChatSendCommand = {
  requestId: "request_1",
  sessionId,
  content: "Say hello",
};

class InMemoryDurableChatService {
  public readonly completions: string[] = [];
  public readonly streamedContent: string[] = [];
  private assistantMessage: ConversationMessage | undefined;

  public prepare(commandToPrepare: ChatSendCommand): Promise<DurableChatPreparation> {
    if (this.assistantMessage !== undefined) {
      return Promise.resolve({
        type: "existing",
        assistantMessage: this.assistantMessage,
      });
    }

    this.assistantMessage = this.createAssistantMessage(commandToPrepare, "pending", "");
    return Promise.resolve({
      type: "new",
      assistantMessage: this.assistantMessage,
      modelMessages: [{ role: "user", content: commandToPrepare.content }],
    });
  }

  public stream(sessionIdToUpdate: string, requestId: string, content: string): Promise<ConversationMessage> {
    this.streamedContent.push(content);
    this.assistantMessage = this.createAssistantMessage(
      { sessionId: sessionIdToUpdate, requestId, content: "" },
      "streaming",
      content,
    );
    return Promise.resolve(this.assistantMessage);
  }

  public complete(sessionIdToUpdate: string, requestId: string, content: string): Promise<ConversationMessage> {
    this.completions.push(content);
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
    commandToPrepare: ChatSendCommand,
    status: ConversationMessage["status"],
    content: string,
    error?: ChatError,
  ): ConversationMessage {
    return {
      id: assistantMessageId,
      sessionId: commandToPrepare.sessionId,
      requestId: commandToPrepare.requestId,
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

function createSocket(): TestSocket {
  const emitted: EmittedEvent[] = [];

  return {
    id: "client_1",
    emitted,
    emit(event: string, payload: unknown): boolean {
      emitted.push({ event, payload });
      return true;
    },
  };
}

function createChatModel(stream: (signal: AbortSignal | undefined) => AsyncIterable<ChatModelEvent>): ChatModelPort {
  return {
    getStatus: (): Promise<ChatModelStatus> =>
      Promise.resolve({
        status: "ready",
        model: "qwen2.5-coder:7b",
        latencyMs: 1,
      }),
    streamChat: (request: ChatModelRequest, signal?: AbortSignal): AsyncIterable<ChatModelEvent> => {
      void request;
      return stream(signal);
    },
  };
}

function createGateway(
  chatModel: ChatModelPort,
  durableChatService: InMemoryDurableChatService,
  gatewayLogger: Logger = logger,
  chatPromptService: ChatPromptService = createPassThroughPromptService(),
): ChatGateway {
  return new ChatGateway(
    new ActiveGenerationRegistry(),
    durableChatService as unknown as DurableChatService,
    chatPromptService,
    new SendChatMessageService(chatModel),
    gatewayLogger,
  );
}

function createPassThroughPromptService(): ChatPromptService {
  return {
    build: vi.fn((request: { readonly messages: ChatModelRequest["messages"] }) =>
      Promise.resolve({
        estimatedHistoryTokens: 0,
        estimatedInputTokens: 0,
        estimatedProjectTokens: 0,
        messages: request.messages,
      }),
    ),
  } as unknown as ChatPromptService;
}

describe("ChatGateway", () => {
  it("persists ordered deltas before emitting completion", async () => {
    const durableChatService = new InMemoryDurableChatService();
    const chatModel = createChatModel(async function* (): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      yield { type: "delta", content: "Hello" };
      yield { type: "delta", content: " world" };
      yield { type: "completed", finishReason: "stop" };
    });
    const gateway = createGateway(chatModel, durableChatService);
    const socket = createSocket();

    gateway.handleChatSend(socket, command);

    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual([
        "chat:accepted",
        "chat:delta",
        "chat:delta",
        "chat:completed",
      ]);
    });
    expect(durableChatService.streamedContent).toEqual(["Hello", "Hello world"]);
    expect(durableChatService.completions).toEqual(["Hello world"]);
  });

  it("replays a duplicate request from durable state without invoking the model again", async () => {
    let modelCalls = 0;
    const durableChatService = new InMemoryDurableChatService();
    const chatModel = createChatModel(async function* (): AsyncGenerator<ChatModelEvent> {
      modelCalls += 1;
      await Promise.resolve();
      yield { type: "delta", content: "Stored response" };
      yield { type: "completed" };
    });
    const gateway = createGateway(chatModel, durableChatService);
    const socket = createSocket();

    gateway.handleChatSend(socket, command);
    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toContain("chat:completed");
    });

    socket.emitted.splice(0);
    gateway.handleChatSend(socket, command);
    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual(["chat:accepted", "chat:delta", "chat:completed"]);
    });
    expect(modelCalls).toBe(1);
  });

  it("passes the project ID to prompt assembly before invoking the model", async () => {
    const durableChatService = new InMemoryDurableChatService();
    const buildPrompt = vi.fn((request: { readonly messages: ChatModelRequest["messages"] }) =>
      Promise.resolve({
        estimatedHistoryTokens: 0,
        estimatedInputTokens: 0,
        estimatedProjectTokens: 0,
        messages: request.messages,
      }),
    );
    const chatPromptService = { build: buildPrompt } as unknown as ChatPromptService;
    const chatModel = createChatModel(async function* (): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      yield { type: "completed" };
    });
    const gateway = createGateway(chatModel, durableChatService, logger, chatPromptService);
    const socket = createSocket();

    gateway.handleChatSend(socket, {
      ...command,
      projectId: "2d2e5770-f08e-48d5-871b-36bf734f535c",
    });

    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toContain("chat:completed");
    });
    expect(buildPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "2d2e5770-f08e-48d5-871b-36bf734f535c",
      }),
      expect.any(AbortSignal),
    );
  });

  it("persists cancellation while prompt context is still being prepared", async () => {
    const durableChatService = new InMemoryDurableChatService();
    const chatModel = createChatModel(async function* (): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      yield { type: "completed" };
    });
    const chatPromptService = {
      build: vi.fn(async (_request: unknown, signal: AbortSignal): Promise<never> => {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", resolve, { once: true });
        });
        throw new ChatModelError("GENERATION_CANCELLED", "Generation was cancelled.");
      }),
    } as unknown as ChatPromptService;
    const gateway = createGateway(chatModel, durableChatService, logger, chatPromptService);
    const socket = createSocket();

    gateway.handleChatSend(socket, command);
    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual(["chat:accepted"]);
    });
    gateway.handleChatCancel(socket, {
      requestId: command.requestId,
      sessionId: command.sessionId,
    });

    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual(["chat:accepted", "chat:cancelled"]);
    });
  });

  it("rejects a concurrent request and persists cancellation after the active request is stopped", async () => {
    const durableChatService = new InMemoryDurableChatService();
    const chatModel = createChatModel(async function* (
      signal: AbortSignal | undefined,
    ): AsyncGenerator<ChatModelEvent> {
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", resolve, { once: true });
      });

      if (signal?.aborted) {
        throw new ChatModelError("GENERATION_CANCELLED", "Generation was cancelled.");
      }

      yield { type: "completed" };
    });
    const gateway = createGateway(chatModel, durableChatService);
    const socket = createSocket();

    gateway.handleChatSend(socket, command);
    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual(["chat:accepted"]);
    });
    gateway.handleChatSend(socket, {
      ...command,
      requestId: "request_2",
    });
    gateway.handleChatCancel(socket, {
      requestId: command.requestId,
      sessionId: command.sessionId,
    });

    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual(["chat:accepted", "chat:error", "chat:cancelled"]);
    });
  });

  it("logs correlated lifecycle metadata without prompt, response, or persistence error content", async () => {
    const promptSecret = "PRIVATE_PROMPT_CONTENT";
    const responseSecret = "PRIVATE_RESPONSE_CONTENT";
    const persistenceSecret = "PRIVATE_DATABASE_ERROR_CONTENT";
    const durableChatService = new InMemoryDurableChatService();
    vi.spyOn(durableChatService, "fail").mockRejectedValue(new Error(persistenceSecret));
    const chatModel = createChatModel(async function* (): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      yield { type: "delta", content: responseSecret };
      throw new ChatModelError("OLLAMA_REQUEST_FAILED", "Provider request failed.");
    });
    const capturedLogger = new CapturedLogger();
    const gateway = createGateway(chatModel, durableChatService, capturedLogger);
    const socket = createSocket();

    gateway.handleChatSend(socket, { ...command, content: promptSecret });

    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual(["chat:accepted", "chat:delta", "chat:error"]);
    });

    const serializedLogs = JSON.stringify(capturedLogger.entries);
    expect(serializedLogs).not.toContain(promptSecret);
    expect(serializedLogs).not.toContain(responseSecret);
    expect(serializedLogs).not.toContain(persistenceSecret);
    expect(
      capturedLogger.entries.some(
        (entry) =>
          entry.context?.requestId === command.requestId &&
          entry.context.sessionId === command.sessionId &&
          entry.context.status === "started",
      ),
    ).toBe(true);
    expect(
      capturedLogger.entries.some(
        (entry) =>
          entry.context?.errorCode === "generation_failed" &&
          entry.context.requestId === command.requestId &&
          entry.context.sessionId === command.sessionId &&
          entry.context.status === "failed",
      ),
    ).toBe(true);
    expect(
      capturedLogger.entries.some(
        (entry) =>
          entry.context?.errorType === "Error" &&
          entry.context.requestId === command.requestId &&
          entry.context.sessionId === command.sessionId &&
          entry.level === "error",
      ),
    ).toBe(true);
  });
});
