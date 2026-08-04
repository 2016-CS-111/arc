import { describe, expect, it } from "vitest";

import { ChatSendCommandSchema } from "./chat-events.contract.js";

describe("ChatSendCommandSchema", () => {
  it("accepts a durable request containing only the current user message", () => {
    const command = {
      requestId: "request_1",
      sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
      content: "Explain a discriminated union.",
    };

    expect(ChatSendCommandSchema.parse(command)).toEqual(command);
  });

  it("accepts an optional registered project ID", () => {
    const command = {
      requestId: "request_1",
      sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
      content: "Explain this project.",
      projectId: "2d2e5770-f08e-48d5-871b-36bf734f535c",
    };

    expect(ChatSendCommandSchema.parse(command)).toEqual(command);
  });

  it("rejects a request without user content", () => {
    expect(() =>
      ChatSendCommandSchema.parse({
        requestId: "request_1",
        sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
        content: "   ",
      }),
    ).toThrow();
  });
});
