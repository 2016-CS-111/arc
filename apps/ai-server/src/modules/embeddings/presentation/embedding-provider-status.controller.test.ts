import { EmbeddingProviderStatusResponseSchema } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import type { EmbeddingModelPort } from "../application/embedding-model.port.js";
import { EmbeddingProviderStatusController } from "./embedding-provider-status.controller.js";

const embeddingModel: EmbeddingModelPort = {
  embed: () => Promise.reject(new Error("Not used by this test.")),
  getStatus: () =>
    Promise.resolve({
      status: "ready",
      model: "bge-m3",
      dimensions: 1_024,
      latencyMs: 8,
    }),
};

describe("EmbeddingProviderStatusController", () => {
  it("returns the shared provider status contract", async () => {
    const response = await new EmbeddingProviderStatusController(embeddingModel).getStatus();

    expect(EmbeddingProviderStatusResponseSchema.parse(response)).toEqual(response);
  });
});
