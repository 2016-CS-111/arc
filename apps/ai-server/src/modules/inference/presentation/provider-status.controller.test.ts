import { OllamaProviderStatusResponseSchema } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { CheckModelReadinessService } from "../application/check-model-readiness.service.js";
import type { ChatModelPort } from "../application/chat-model.port.js";
import type { ChatModelEvent, ChatModelStatus } from "../domain/chat-model.types.js";
import { ProviderStatusController } from "./provider-status.controller.js";

function createEmptyStream(): AsyncIterable<ChatModelEvent> {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<ChatModelEvent> {
      await Promise.resolve();
      yield { type: "completed" };
    },
  };
}

const chatModel: ChatModelPort = {
  getStatus: (): Promise<ChatModelStatus> =>
    Promise.resolve({
      status: "ready",
      model: "qwen2.5-coder:7b",
      latencyMs: 12,
    }),
  streamChat: (): AsyncIterable<ChatModelEvent> => createEmptyStream(),
};

describe("ProviderStatusController", () => {
  it("returns a valid Ollama provider status contract", async () => {
    const service = new CheckModelReadinessService(chatModel);
    const controller = new ProviderStatusController(service);
    const response = await controller.getOllamaStatus();

    expect(OllamaProviderStatusResponseSchema.parse(response)).toEqual(response);
  });
});
