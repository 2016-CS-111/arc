import { describe, expect, it } from "vitest";

import { parseExtensionToWebviewMessage, parseWebviewToExtensionMessage } from "./chatWebview.contract.js";

const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";

describe("webview chat contract", () => {
  it("accepts webview readiness, status, and chat commands", () => {
    expect(parseWebviewToExtensionMessage({ type: "webview:ready" })).toEqual({
      type: "webview:ready",
    });
    expect(parseWebviewToExtensionMessage({ type: "status:refresh" })).toEqual({
      type: "status:refresh",
    });
    expect(parseWebviewToExtensionMessage({ content: "Explain this function", type: "chat:submit" })).toEqual({
      content: "Explain this function",
      type: "chat:submit",
    });
    expect(parseWebviewToExtensionMessage({ type: "chat:cancel" })).toEqual({
      type: "chat:cancel",
    });
    expect(parseWebviewToExtensionMessage({ type: "conversation:create" })).toEqual({
      type: "conversation:create",
    });
    expect(
      parseWebviewToExtensionMessage({
        sessionId,
        title: "Architecture notes",
        type: "conversation:rename",
      }),
    ).toMatchObject({ type: "conversation:rename" });
    expect(parseWebviewToExtensionMessage({ content: "const answer = 42;", type: "code:copy" })).toEqual({
      content: "const answer = 42;",
      type: "code:copy",
    });
    expect(parseWebviewToExtensionMessage({ type: "link:open", url: "https://example.com/docs" })).toEqual({
      type: "link:open",
      url: "https://example.com/docs",
    });
  });

  it("rejects unrecognized webview messages", () => {
    expect(parseWebviewToExtensionMessage({ type: "chat:send", prompt: "hello" })).toBeNull();
    expect(
      parseWebviewToExtensionMessage({ type: "link:open", url: "vscode:workbench.action.openSettings" }),
    ).toBeNull();
    expect(parseWebviewToExtensionMessage({ type: "link:open", url: "not a url" })).toBeNull();
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

  it("accepts a hydrated in-memory chat session", () => {
    const timestamp = "2026-07-18T12:00:00.000Z";

    expect(
      parseExtensionToWebviewMessage({
        session: {
          activeGeneration: {
            assistantMessageId: "assistant-1",
            requestId: "request-1",
          },
          connectionStatus: "idle",
          messages: [
            {
              content: "Explain this function",
              createdAt: timestamp,
              id: "user-1",
              role: "user",
              status: "completed",
            },
            {
              content: "",
              createdAt: timestamp,
              id: "assistant-1",
              role: "assistant",
              status: "pending",
            },
          ],
          sessionId: "session-1",
        },
        type: "chat:hydrated",
      }),
    ).toMatchObject({ type: "chat:hydrated" });
  });

  it("accepts a durable conversation list update", () => {
    const timestamp = "2026-07-18T12:00:00.000Z";

    expect(
      parseExtensionToWebviewMessage({
        snapshot: {
          activeSessionId: sessionId,
          sessions: [
            {
              createdAt: timestamp,
              id: sessionId,
              messageCount: 2,
              title: "Architecture notes",
              updatedAt: timestamp,
            },
          ],
        },
        type: "conversations:updated",
      }),
    ).toMatchObject({ type: "conversations:updated" });
  });
});
