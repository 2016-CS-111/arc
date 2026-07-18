import { describe, expect, it } from "vitest";

import {
  parseExtensionToWebviewMessage,
  parseWebviewToExtensionMessage,
} from "./chatWebview.contract.js";

describe("webview chat contract", () => {
  it("accepts the two webview commands", () => {
    expect(parseWebviewToExtensionMessage({ type: "webview:ready" })).toEqual({
      type: "webview:ready",
    });
    expect(parseWebviewToExtensionMessage({ type: "status:refresh" })).toEqual({
      type: "status:refresh",
    });
  });

  it("rejects unrecognized webview messages", () => {
    expect(parseWebviewToExtensionMessage({ type: "chat:send", prompt: "hello" })).toBeNull();
  });

  it("accepts a validated status update", () => {
    const checkedAt = "2026-07-18T12:00:00.000Z";
    expect(
      parseExtensionToWebviewMessage({
        snapshot: {
          backend: {
            service: "arc-ai-server",
            status: "ok",
            timestamp: checkedAt,
            uptimeSeconds: 42,
          },
          backendUrl: "http://127.0.0.1:7331",
          checkedAt,
          ollama: {
            latencyMs: 17,
            model: "qwen2.5-coder:7b",
            provider: "ollama",
            status: "ready",
          },
        },
        type: "status:update",
      }),
    ).toMatchObject({ type: "status:update" });
  });
});
