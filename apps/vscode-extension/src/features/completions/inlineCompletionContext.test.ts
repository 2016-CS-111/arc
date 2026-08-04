import { describe, expect, it } from "vitest";

import { buildInlineCompletionRequest } from "./inlineCompletionContext.js";

describe("buildInlineCompletionRequest", () => {
  it("keeps FIM context bounded while retaining imports and nearby declarations", () => {
    const source = 'import { Queue } from "bullmq";\nclass JobService {}\nconst queue = new Queue("jobs");\nqueue.';
    const request = buildInlineCompletionRequest({
      language: "typescript",
      maxPrefixChars: 40,
      maxSuffixChars: 20,
      maxTokens: 64,
      offset: source.length,
      path: "src/jobs.ts",
      projectId: null,
      source,
      sourceVersion: 4,
    });

    expect(request.prefix).toBe(source.slice(-40));
    expect(request.suffix).toBe("");
    expect(request.imports).toEqual(['import { Queue } from "bullmq";']);
    expect(request.nearbySymbols).toEqual(["queue"]);
  });
});
