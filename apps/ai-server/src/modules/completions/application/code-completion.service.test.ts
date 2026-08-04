import type { CodeCompletionModelPort } from "../../inference/application/code-completion-model.port.js";
import type { CodeCompletionModelStatus } from "../../inference/domain/code-completion.types.js";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import { CodeCompletionService } from "./code-completion.service.js";

describe("CodeCompletionService", () => {
  it("caps model output and removes a repeated document suffix", async () => {
    const complete = vi.fn(() =>
      Promise.resolve({ completion: "value;\nnext", latencyMs: 23, model: "qwen2.5-coder:7b" }),
    );
    const service = new CodeCompletionService(
      { complete, getStatus: vi.fn() } satisfies CodeCompletionModelPort,
      loadConfig({ ARC_COMPLETION_MAX_TOKENS: "64" }),
    );

    await expect(
      service.complete({
        imports: [],
        language: "typescript",
        maxTokens: 128,
        nearbySymbols: [],
        path: null,
        prefix: "const answer = ",
        projectId: null,
        sourceVersion: 2,
        suffix: ";\nnext",
      }),
    ).resolves.toEqual({ completion: "value", latencyMs: 23, model: "qwen2.5-coder:7b" });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 64, prefix: "const answer = ", suffix: ";\nnext" }),
      undefined,
    );
  });

  it("exposes provider fill-in-the-middle capability status", async () => {
    const status: CodeCompletionModelStatus = {
      latencyMs: 12,
      model: "qwen2.5-coder:7b",
      status: "ready",
      supportsFillInMiddle: true,
    };
    const service = new CodeCompletionService(
      { complete: vi.fn(), getStatus: vi.fn(() => Promise.resolve(status)) } satisfies CodeCompletionModelPort,
      loadConfig(),
    );

    await expect(service.getStatus()).resolves.toEqual(status);
  });
});
