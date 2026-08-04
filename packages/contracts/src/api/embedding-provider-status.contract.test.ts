import { describe, expect, it } from "vitest";

import { EmbeddingProviderStatusResponseSchema } from "./embedding-provider-status.contract.js";

describe("embedding provider status contract", () => {
  it("accepts a ready local embedding provider", () => {
    expect(
      EmbeddingProviderStatusResponseSchema.parse({
        provider: "ollama",
        status: "ready",
        model: "bge-m3",
        dimensions: 1_024,
        latencyMs: 12,
      }),
    ).toMatchObject({ model: "bge-m3", dimensions: 1_024 });
  });
});
