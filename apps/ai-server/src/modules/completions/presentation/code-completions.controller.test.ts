import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { CodeCompletionService } from "../application/code-completion.service.js";
import { CodeCompletionsController } from "./code-completions.controller.js";

describe("CodeCompletionsController", () => {
  it("validates and forwards a completion request", async () => {
    const complete = vi.fn(() => Promise.resolve({ completion: "value", latencyMs: 12, model: "qwen2.5-coder:7b" }));
    const controller = new CodeCompletionsController({
      complete,
      getStatus: vi.fn(),
    } as unknown as CodeCompletionService);

    await expect(
      controller.complete({ language: "typescript", prefix: "const answer = ", sourceVersion: 1, suffix: ";" }),
    ).resolves.toMatchObject({ completion: "value" });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ imports: [], maxTokens: 128, nearbySymbols: [], projectId: null }),
    );
  });

  it("maps malformed and unavailable requests to HTTP errors", async () => {
    const controller = new CodeCompletionsController({
      complete: vi.fn(() => Promise.reject(new Error("offline"))),
      getStatus: vi.fn(),
    } as unknown as CodeCompletionService);

    await expect(controller.complete({ prefix: "x" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.complete({ language: "typescript", prefix: "x", sourceVersion: 1, suffix: "" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
