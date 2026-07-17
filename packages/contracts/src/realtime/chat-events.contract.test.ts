import { describe, expect, it } from "vitest";

import { ChatSendCommandSchema } from "./chat-events.contract.js";

describe("ChatSendCommandSchema", () => {
  it("accepts a conversation that ends with a user message", () => {
    const command = {
      requestId: "request_1",
      sessionId: "session_1",
      messages: [
        { role: "assistant", content: "How can I help?" },
        { role: "user", content: "Explain a discriminated union." },
      ],
    };

    expect(ChatSendCommandSchema.parse(command)).toEqual(command);
  });

  it("rejects requests that do not end with a user message", () => {
    expect(() =>
      ChatSendCommandSchema.parse({
        requestId: "request_1",
        sessionId: "session_1",
        messages: [{ role: "assistant", content: "How can I help?" }],
      }),
    ).toThrow();
  });
});
