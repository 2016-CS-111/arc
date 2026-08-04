import { describe, expect, it, vi } from "vitest";

import { CompletionClient } from "./CompletionClient.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

describe("CompletionClient", () => {
  it("uses validated cancellable completion endpoints", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ completion: "value", latencyMs: 22, model: "qwen2.5-coder:7b" }))
      .mockResolvedValueOnce(
        response({ latencyMs: 4, model: "qwen2.5-coder:7b", status: "ready", supportsFillInMiddle: true }),
      );
    const client = new CompletionClient("http://127.0.0.1:7331", fetchImplementation);
    const controller = new AbortController();

    await expect(
      client.complete(
        {
          imports: [],
          language: "typescript",
          maxTokens: 64,
          nearbySymbols: [],
          path: null,
          prefix: "const value = ",
          projectId: null,
          sourceVersion: 1,
          suffix: ";",
        },
        controller.signal,
      ),
    ).resolves.toMatchObject({ completion: "value" });
    await expect(client.getStatus()).resolves.toMatchObject({ supportsFillInMiddle: true });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:7331/completions",
      expect.objectContaining({ method: "POST", signal: controller.signal }),
    );
  });
});
