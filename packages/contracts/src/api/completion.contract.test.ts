import { describe, expect, it } from "vitest";

import { CodeCompletionRequestSchema, CodeCompletionStatusResponseSchema } from "./completion.contract.js";

describe("CodeCompletionRequestSchema", () => {
  it("applies bounded defaults for a local fill-in-the-middle request", () => {
    expect(
      CodeCompletionRequestSchema.parse({
        language: "typescript",
        prefix: "const answer = ",
        sourceVersion: 3,
        suffix: ";\n",
      }),
    ).toEqual({
      imports: [],
      language: "typescript",
      maxTokens: 128,
      nearbySymbols: [],
      path: null,
      prefix: "const answer = ",
      projectId: null,
      sourceVersion: 3,
      suffix: ";\n",
    });
  });

  it("rejects unbounded or malformed completion data", () => {
    expect(() =>
      CodeCompletionRequestSchema.parse({ language: "typescript", prefix: "", sourceVersion: -1, suffix: "" }),
    ).toThrow();
    expect(() =>
      CodeCompletionStatusResponseSchema.parse({
        latencyMs: 1,
        model: "qwen2.5-coder:7b",
        status: "ready",
      }),
    ).toThrow();
  });
});
