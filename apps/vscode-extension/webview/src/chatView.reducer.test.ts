import { describe, expect, it } from "vitest";

import { chatViewReducer, initialChatViewState } from "./chatView.reducer.js";

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
});
