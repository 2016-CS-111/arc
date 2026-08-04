import { describe, expect, it } from "vitest";

import { buildGuidedCodeActionRequest } from "./guidedCodeActionContext.js";

describe("buildGuidedCodeActionRequest", () => {
  it("keeps selected source context bounded and serializes an editor range", () => {
    const request = buildGuidedCodeActionRequest({
      action: "simplify",
      diagnostic: undefined,
      language: "typescript",
      path: "src/example.ts",
      projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
      range: { end: { character: 5, line: 3 }, start: { character: 2, line: 1 } },
      requestId: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
      source: "x".repeat(30_000),
      sourceVersion: 4,
    });

    expect(request.source).toHaveLength(24_000);
    expect(request.diagnostic).toBeNull();
    expect(request.range).toEqual({ end: { character: 5, line: 3 }, start: { character: 2, line: 1 } });
  });
});
