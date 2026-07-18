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

    expect(chatViewReducer(initialChatViewState, { snapshot, type: "status:received" })).toEqual({
      snapshot,
    });
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
});
