import { describe, expect, it } from "vitest";

import {
  ConversationSessionSnapshotSchema,
  CreateConversationSessionRequestSchema,
  RenameConversationSessionRequestSchema,
} from "./conversation.contract.js";

const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";
const messageId = "8396c93e-e5f1-4ff3-a311-7d5e4f2baeaa";
const timestamp = "2026-07-18T12:00:00.000Z";

describe("conversation contracts", () => {
  it("accepts a durable session snapshot with terminal message state", () => {
    expect(
      ConversationSessionSnapshotSchema.parse({
        id: sessionId,
        title: "TypeScript help",
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [
          {
            id: messageId,
            sessionId,
            requestId: "request-1",
            ordinal: 1,
            role: "assistant",
            status: "failed",
            content: "Partial output",
            error: {
              code: "generation_timeout",
              message: "The model did not respond in time.",
              retryable: true,
            },
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
    ).toMatchObject({ id: sessionId });
  });

  it("validates session creation and rename input", () => {
    expect(CreateConversationSessionRequestSchema.parse({})).toEqual({});
    expect(RenameConversationSessionRequestSchema.parse({ title: "Architecture notes" })).toEqual({
      title: "Architecture notes",
    });
    expect(() => RenameConversationSessionRequestSchema.parse({ title: "   " })).toThrow();
  });
});
