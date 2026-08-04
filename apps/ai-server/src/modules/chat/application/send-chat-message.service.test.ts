import { describe, expect, it, vi } from "vitest";

import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import type { ChatModelEvent, ChatModelRequest, ChatModelStatus } from "../../inference/domain/chat-model.types.js";
import type { ToolRuntimeService } from "../../tools/application/tool-runtime.service.js";
import { SendChatMessageService, type SendChatMessageEvent } from "./send-chat-message.service.js";

async function collectEvents(stream: AsyncIterable<SendChatMessageEvent>): Promise<SendChatMessageEvent[]> {
  const events: SendChatMessageEvent[] = [];

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
      streamChat: async function* (request: ChatModelRequest, signal?: AbortSignal): AsyncGenerator<ChatModelEvent> {
        capturedRequest = request;
        capturedSignal = signal;
        await Promise.resolve();
        yield { type: "delta", content: "Hello" };
        yield { type: "completed", finishReason: "stop" };
      },
    };
    const service = new SendChatMessageService(chatModel, createToolRuntime());
    const controller = new AbortController();
    const messages = [{ role: "user" as const, content: "Say hello" }];

    await expect(
      collectEvents(
        service.stream(
          {
            messages,
            requestId: "request_1",
            sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
          },
          controller.signal,
        ),
      ),
    ).resolves.toEqual([
      { type: "delta", content: "Hello" },
      { type: "completed", finishReason: "stop" },
    ]);
    expect(capturedRequest?.messages).toEqual(expect.arrayContaining(messages));
    expect(capturedSignal).toBe(controller.signal);
  });

  it("executes native tool calls before streaming the model's final response", async () => {
    const requests: ChatModelRequest[] = [];
    const chatModel: ChatModelPort = {
      getStatus: (): Promise<ChatModelStatus> =>
        Promise.resolve({ status: "ready", model: "qwen2.5-coder:7b", latencyMs: 1 }),
      streamChat: async function* (request: ChatModelRequest): AsyncGenerator<ChatModelEvent> {
        requests.push(request);
        await Promise.resolve();
        if (requests.length === 1) {
          yield {
            type: "tool_calls",
            calls: [{ id: "ollama_1", name: "arc.runtime_info", arguments: {} }],
          };
          yield { type: "completed" };
          return;
        }

        yield { type: "delta", content: "Arc has a typed tool runtime." };
        yield { type: "completed", finishReason: "stop" };
      },
    };
    const execute = vi.fn(() =>
      Promise.resolve({
        callId: "ollama_1",
        name: "arc.runtime_info",
        status: "completed" as const,
        content: '{"result":{"runtime":"arc"}}',
      }),
    );
    const toolRuntime = {
      execute,
      getDefinitions: () => [
        {
          name: "arc.runtime_info",
          description: "Return runtime information.",
          permission: "none" as const,
          parameters: { type: "object" },
        },
      ],
      getMaxCallsPerTurn: (): number => 4,
    } as unknown as ToolRuntimeService;
    const service = new SendChatMessageService(chatModel, toolRuntime);

    await expect(
      collectEvents(
        service.stream(
          {
            messages: [{ role: "user", content: "What can Arc do?" }],
            requestId: "request_1",
            sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
          },
          new AbortController().signal,
        ),
      ),
    ).resolves.toEqual([
      {
        type: "tool",
        result: {
          callId: "ollama_1",
          content: '{"result":{"runtime":"arc"}}',
          name: "arc.runtime_info",
          status: "completed",
        },
      },
      { type: "delta", content: "Arc has a typed tool runtime." },
      { type: "completed", finishReason: "stop" },
    ]);
    expect(execute).toHaveBeenCalledWith(
      { id: "ollama_1", name: "arc.runtime_info", arguments: {} },
      expect.objectContaining({ requestId: "request_1" }),
    );
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      content: '{"result":{"runtime":"arc"}}',
      toolName: "arc.runtime_info",
    });
  });
});

function createToolRuntime(): ToolRuntimeService {
  return {
    execute: (): Promise<never> => Promise.reject(new Error("Tool execution was not expected.")),
    getDefinitions: (): readonly [] => [],
    getMaxCallsPerTurn: (): number => 4,
  } as unknown as ToolRuntimeService;
}
