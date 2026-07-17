import type { ChatSendCommand } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import type {
  ChatModelEvent,
  ChatModelRequest,
  ChatModelStatus,
} from "../../inference/domain/chat-model.types.js";
import { SendChatMessageService } from "./send-chat-message.service.js";

async function collectEvents(stream: AsyncIterable<ChatModelEvent>): Promise<ChatModelEvent[]> {
  const events: ChatModelEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

describe("SendChatMessageService", () => {
  it("passes the validated conversation and abort signal to the model port", async () => {
    let capturedRequest: ChatModelRequest | undefined;
    let capturedSignal: AbortSignal | undefined;
    const chatModel: ChatModelPort = {
      getStatus: (): Promise<ChatModelStatus> =>
        Promise.resolve({
          status: "ready",
          model: "qwen2.5-coder:7b",
          latencyMs: 1,
        }),
      streamChat: async function* (
        request: ChatModelRequest,
        signal?: AbortSignal,
      ): AsyncGenerator<ChatModelEvent> {
        capturedRequest = request;
        capturedSignal = signal;
        await Promise.resolve();
        yield { type: "delta", content: "Hello" };
        yield { type: "completed", finishReason: "stop" };
      },
    };
    const service = new SendChatMessageService(chatModel);
    const controller = new AbortController();
    const command: ChatSendCommand = {
      requestId: "request_1",
      sessionId: "session_1",
      messages: [{ role: "user", content: "Say hello" }],
    };

    await expect(collectEvents(service.stream(command, controller.signal))).resolves.toEqual([
      { type: "delta", content: "Hello" },
      { type: "completed", finishReason: "stop" },
    ]);
    expect(capturedRequest).toEqual({ messages: command.messages });
    expect(capturedSignal).toBe(controller.signal);
  });
});
