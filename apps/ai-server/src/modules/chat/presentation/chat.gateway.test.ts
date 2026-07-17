import type { ChatSendCommand } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import { ChatModelError } from "../../inference/domain/chat-model.errors.js";
import type {
  ChatModelEvent,
  ChatModelRequest,
  ChatModelStatus,
} from "../../inference/domain/chat-model.types.js";
import { ActiveGenerationRegistry } from "../application/active-generation.registry.js";
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

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};

const command: ChatSendCommand = {
  requestId: "request_1",
  sessionId: "session_1",
  messages: [{ role: "user", content: "Say hello" }],
};

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

function createChatModel(
  stream: (signal: AbortSignal | undefined) => AsyncIterable<ChatModelEvent>,
): ChatModelPort {
  return {
    getStatus: (): Promise<ChatModelStatus> =>
      Promise.resolve({
        status: "ready",
        model: "qwen2.5-coder:7b",
        latencyMs: 1,
      }),
    streamChat: (
      request: ChatModelRequest,
      signal?: AbortSignal,
    ): AsyncIterable<ChatModelEvent> => {
      void request;
      return stream(signal);
    },
  };
}

function createGateway(chatModel: ChatModelPort): ChatGateway {
  return new ChatGateway(
    new ActiveGenerationRegistry(),
    new SendChatMessageService(chatModel),
    logger,
  );
}

describe("ChatGateway", () => {
  it("emits accepted, ordered deltas, and completion events", async () => {
    const chatModel = createChatModel(async function* (): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      yield { type: "delta", content: "Hello" };
      yield { type: "delta", content: " world" };
      yield { type: "completed", finishReason: "stop" };
    });
    const gateway = createGateway(chatModel);
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
  });

  it("rejects a concurrent request and emits cancellation after the active request is stopped", async () => {
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
    const gateway = createGateway(chatModel);
    const socket = createSocket();

    gateway.handleChatSend(socket, command);
    gateway.handleChatSend(socket, {
      ...command,
      requestId: "request_2",
    });
    gateway.handleChatCancel(socket, {
      requestId: command.requestId,
      sessionId: command.sessionId,
    });

    await vi.waitFor(() => {
      expect(socket.emitted.map((entry) => entry.event)).toEqual([
        "chat:accepted",
        "chat:error",
        "chat:cancelled",
      ]);
    });
  });
});
