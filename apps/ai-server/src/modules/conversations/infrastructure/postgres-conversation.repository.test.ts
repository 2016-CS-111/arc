import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { PostgresConversationRepository } from "./postgres-conversation.repository.js";

const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";
const requestId = "3b7acbf0-c8f4-4f27-a537-0b6ac906531a";
const timestamp = new Date("2026-07-18T08:00:00.000Z");

const sessionRow = {
  id: sessionId,
  title: "New conversation",
  created_at: timestamp,
  updated_at: timestamp,
};

const existingTurnRows = [
  {
    id: "e97367c1-c595-4aa2-b8d9-a852cbbd69a4",
    session_id: sessionId,
    request_id: requestId,
    ordinal: 1,
    role: "user" as const,
    status: "completed" as const,
    content: "Hello",
    error: null,
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: "1d089847-4de9-41c0-af93-3d7411a6068e",
    session_id: sessionId,
    request_id: requestId,
    ordinal: 2,
    role: "assistant" as const,
    status: "streaming" as const,
    content: "Hi",
    error: null,
    created_at: timestamp,
    updated_at: timestamp,
  },
];

function queryResult<TRow>(rows: readonly TRow[]) {
  return { rows };
}

describe("PostgresConversationRepository", () => {
  it("returns an existing request turn without allocating duplicate message ordinals", async () => {
    const query = vi.fn((text: string) => {
      if (text === "BEGIN" || text === "COMMIT") {
        return Promise.resolve(queryResult([]));
      }
      if (text.includes("FOR UPDATE")) {
        return Promise.resolve(queryResult([sessionRow]));
      }
      if (text.includes("WHERE session_id = $1 AND request_id = $2")) {
        return Promise.resolve(queryResult(existingTurnRows));
      }

      return Promise.reject(new Error(`Unexpected query: ${text}`));
    });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(() => Promise.resolve(client)) } as unknown as Pool;
    const repository = new PostgresConversationRepository(pool);

    await expect(repository.createPendingTurn({ sessionId, requestId, userContent: "Hello" })).resolves.toMatchObject({
      session: { id: sessionId },
      userMessage: { content: "Hello", ordinal: 1 },
      assistantMessage: { content: "Hi", ordinal: 2, status: "streaming" },
    });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("next_message_ordinal"));
    expect(release).toHaveBeenCalledOnce();
  });

  it("qualifies session columns in the list query and maps the message count", async () => {
    const query = vi.fn(() => Promise.resolve(queryResult([{ ...sessionRow, message_count: "2" }])));
    const pool = { query } as unknown as Pool;
    const repository = new PostgresConversationRepository(pool);

    await expect(repository.listSessions({ limit: 5 })).resolves.toEqual([
      {
        id: sessionId,
        title: "New conversation",
        messageCount: 2,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("chat_sessions.id"), [5]);
  });

  it("marks pending and streaming assistant messages as failed during recovery", async () => {
    const query = vi.fn(() => Promise.resolve(queryResult([{ id: existingTurnRows[1].id }])));
    const pool = { query } as unknown as Pool;
    const repository = new PostgresConversationRepository(pool);
    const error = {
      code: "generation_failed" as const,
      message: "Generation interrupted by an Arc backend restart.",
      retryable: true,
    };

    await expect(repository.recoverInterruptedAssistantMessages(error)).resolves.toBe(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status IN ('pending', 'streaming')"), [
      JSON.stringify(error),
    ]);
  });
});
