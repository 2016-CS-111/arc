import { describe, expect, it } from "vitest";

import { chatViewReducer, initialChatViewState } from "./chatView.reducer.js";

const timestamp = "2026-07-18T12:00:00.000Z";

const chatSession = {
  activeGeneration: {
    assistantMessageId: "assistant-1",
    requestId: "request-1",
  },
  connectionStatus: "idle" as const,
  messages: [
    {
      content: "Explain this function",
      createdAt: timestamp,
      id: "user-1",
      role: "user" as const,
      status: "completed" as const,
    },
    {
      content: "",
      createdAt: timestamp,
      id: "assistant-1",
      role: "assistant" as const,
      status: "pending" as const,
    },
  ],
  sessionId: "session-1",
};

describe("chatViewReducer", () => {
  it("keeps the latest status snapshot", () => {
    const snapshot = {
      backend: null,
      backendUrl: "http://127.0.0.1:7331",
      checkedAt: "2026-07-18T12:00:00.000Z",
      ollama: null,
    };

    expect(chatViewReducer(initialChatViewState, { snapshot, type: "status:received" })).toMatchObject({ snapshot });
  });

  it("applies a streaming lifecycle after hydration", () => {
    const hydrated = chatViewReducer(initialChatViewState, {
      session: chatSession,
      type: "chat:hydrated",
    });
    const started = chatViewReducer(hydrated, {
      requestId: "request-1",
      type: "chat:generation-started",
    });
    const streamed = chatViewReducer(started, {
      content: "It returns a value.",
      requestId: "request-1",
      type: "chat:generation-delta",
    });
    const completed = chatViewReducer(streamed, {
      requestId: "request-1",
      type: "chat:generation-completed",
    });

    expect(completed.chat).toMatchObject({ activeGeneration: null });
    expect(completed.chat?.messages[1]).toMatchObject({
      content: "It returns a value.",
      status: "completed",
    });
  });

  it("ignores a stale generation event", () => {
    const hydrated = chatViewReducer(initialChatViewState, {
      session: chatSession,
      type: "chat:hydrated",
    });

    expect(
      chatViewReducer(hydrated, {
        content: "stale",
        requestId: "request-other",
        type: "chat:generation-delta",
      }),
    ).toBe(hydrated);
  });

  it("preserves partial output and its error after a failed generation", () => {
    const hydrated = chatViewReducer(initialChatViewState, {
      session: chatSession,
      type: "chat:hydrated",
    });
    const started = chatViewReducer(hydrated, {
      requestId: "request-1",
      type: "chat:generation-started",
    });
    const streamed = chatViewReducer(started, {
      content: "Partial output",
      requestId: "request-1",
      type: "chat:generation-delta",
    });
    const failed = chatViewReducer(streamed, {
      error: {
        code: "connection_unavailable",
        message: "Connection to the Arc backend was lost.",
        retryable: true,
      },
      requestId: "request-1",
      type: "chat:generation-failed",
    });

    expect(failed.chat).toMatchObject({ activeGeneration: null });
    expect(failed.chat?.messages[1]).toMatchObject({
      content: "Partial output",
      error: { code: "connection_unavailable", retryable: true },
      status: "failed",
    });
  });

  it("updates the hydrated connection state", () => {
    const hydrated = chatViewReducer(initialChatViewState, {
      session: chatSession,
      type: "chat:hydrated",
    });

    expect(
      chatViewReducer(hydrated, {
        status: "offline",
        type: "chat:connection-updated",
      }).chat,
    ).toMatchObject({ connectionStatus: "offline" });
  });

  it("keeps durable conversation state and a history error", () => {
    const conversationSnapshot = {
      activeSessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
      sessions: [
        {
          createdAt: timestamp,
          id: "0d2e5770-f08e-48d5-871b-36bf734f535c",
          messageCount: 2,
          title: "Architecture notes",
          updatedAt: timestamp,
        },
      ],
    };
    const updated = chatViewReducer(initialChatViewState, {
      snapshot: conversationSnapshot,
      type: "conversations:updated",
    });

    expect(updated.conversations).toEqual(conversationSnapshot);
    expect(
      chatViewReducer(updated, {
        message: "Arc backend is unavailable.",
        type: "conversations:error",
      }).conversationError,
    ).toBe("Arc backend is unavailable.");
  });
});
