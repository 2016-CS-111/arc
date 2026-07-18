import {
  ChatErrorSchema,
  ConversationMessageSchema,
  ConversationSessionSchema,
  ConversationSessionSnapshotSchema,
  ConversationSessionSummarySchema,
  type ChatError,
  type ConversationMessage,
  type ConversationSession,
  type ConversationSessionSnapshot,
  type ConversationSessionSummary,
} from "@arc/contracts";
import type { Pool, PoolClient } from "pg";

import type { ConversationRepository } from "../application/conversation.repository.js";
import type {
  ConversationListOptions,
  ConversationTurn,
  CreateConversationSessionInput,
  CreateConversationTurnInput,
  UpdateAssistantMessageInput,
} from "../domain/conversation.types.js";

interface SessionRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface SessionSummaryRow extends SessionRow {
  readonly message_count: number | string;
}

interface MessageRow {
  readonly id: string;
  readonly session_id: string;
  readonly request_id: string;
  readonly ordinal: number | string;
  readonly role: "user" | "assistant";
  readonly status: "pending" | "streaming" | "completed" | "cancelled" | "failed";
  readonly content: string;
  readonly error: unknown;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const sessionColumns = "id, title, created_at, updated_at";
const qualifiedSessionColumns =
  "chat_sessions.id, chat_sessions.title, chat_sessions.created_at, chat_sessions.updated_at";
const messageColumns = "id, session_id, request_id, ordinal, role, status, content, error, created_at, updated_at";

export class PostgresConversationRepository implements ConversationRepository {
  public constructor(private readonly pool: Pool) {}

  public async createSession(input: CreateConversationSessionInput): Promise<ConversationSession> {
    const result =
      input.title === undefined
        ? await this.pool.query<SessionRow>(`INSERT INTO chat_sessions DEFAULT VALUES RETURNING ${sessionColumns}`)
        : await this.pool.query<SessionRow>(
            `INSERT INTO chat_sessions (title) VALUES ($1) RETURNING ${sessionColumns}`,
            [input.title],
          );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error("PostgreSQL did not return the new Arc conversation session.");
    }

    return toConversationSession(row);
  }

  public async listSessions(options: ConversationListOptions = {}): Promise<ConversationSessionSummary[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const result = await this.pool.query<SessionSummaryRow>(
      `
        SELECT ${qualifiedSessionColumns}, COUNT(chat_messages.id)::integer AS message_count
        FROM chat_sessions
        LEFT JOIN chat_messages ON chat_messages.session_id = chat_sessions.id
        GROUP BY chat_sessions.id
        ORDER BY chat_sessions.updated_at DESC, chat_sessions.id DESC
        LIMIT $1
      `,
      [limit],
    );

    return result.rows.map(toConversationSessionSummary);
  }

  public async getSession(sessionId: string): Promise<ConversationSessionSnapshot | undefined> {
    const sessionResult = await this.pool.query<SessionRow>(
      `SELECT ${sessionColumns} FROM chat_sessions WHERE id = $1`,
      [sessionId],
    );
    const session = sessionResult.rows[0];
    if (session === undefined) {
      return undefined;
    }

    const messageResult = await this.pool.query<MessageRow>(
      `
        SELECT ${messageColumns}
        FROM (
          SELECT ${messageColumns}
          FROM chat_messages
          WHERE session_id = $1
          ORDER BY ordinal DESC
          LIMIT 200
        ) AS recent_messages
        ORDER BY ordinal ASC
      `,
      [sessionId],
    );

    return ConversationSessionSnapshotSchema.parse({
      ...toConversationSession(session),
      messages: messageResult.rows.map(toConversationMessage),
    });
  }

  public async renameSession(sessionId: string, title: string): Promise<ConversationSession | undefined> {
    const result = await this.pool.query<SessionRow>(
      `UPDATE chat_sessions SET title = $2 WHERE id = $1 RETURNING ${sessionColumns}`,
      [sessionId, title],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : toConversationSession(row);
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM chat_sessions WHERE id = $1", [sessionId]);
    return (result.rowCount ?? 0) > 0;
  }

  public async createPendingTurn(input: CreateConversationTurnInput): Promise<ConversationTurn | undefined> {
    return this.withTransaction(async (client) => {
      const sessionResult = await client.query<SessionRow>(
        `SELECT ${sessionColumns} FROM chat_sessions WHERE id = $1 FOR UPDATE`,
        [input.sessionId],
      );
      const session = sessionResult.rows[0];
      if (session === undefined) {
        return undefined;
      }

      const existingMessages = await client.query<MessageRow>(
        `
          SELECT ${messageColumns}
          FROM chat_messages
          WHERE session_id = $1 AND request_id = $2
          ORDER BY ordinal ASC
        `,
        [input.sessionId, input.requestId],
      );
      if (existingMessages.rows.length > 0) {
        return toConversationTurn(session, existingMessages.rows);
      }

      const ordinalResult = await client.query<{ readonly next_message_ordinal: number | string }>(
        `
          UPDATE chat_sessions
          SET next_message_ordinal = next_message_ordinal + 2
          WHERE id = $1
          RETURNING next_message_ordinal
        `,
        [input.sessionId],
      );
      const nextOrdinal = ordinalResult.rows[0]?.next_message_ordinal;
      if (nextOrdinal === undefined) {
        throw new Error("PostgreSQL could not allocate Arc conversation message order.");
      }

      const assistantOrdinal = toInteger(nextOrdinal);
      const userOrdinal = assistantOrdinal - 1;
      const insertedMessages = await client.query<MessageRow>(
        `
          INSERT INTO chat_messages (session_id, request_id, ordinal, role, status, content)
          VALUES
            ($1, $2, $3, 'user', 'completed', $4),
            ($1, $2, $5, 'assistant', 'pending', '')
          RETURNING ${messageColumns}
        `,
        [input.sessionId, input.requestId, userOrdinal, input.userContent, assistantOrdinal],
      );
      const refreshedSessionResult = await client.query<SessionRow>(
        `SELECT ${sessionColumns} FROM chat_sessions WHERE id = $1`,
        [input.sessionId],
      );
      const refreshedSession = refreshedSessionResult.rows[0];
      if (refreshedSession === undefined) {
        throw new Error("PostgreSQL lost the Arc conversation session while creating a turn.");
      }

      return toConversationTurn(refreshedSession, insertedMessages.rows);
    });
  }

  public async updateAssistantMessage(input: UpdateAssistantMessageInput): Promise<ConversationMessage | undefined> {
    const error = input.error === undefined ? null : JSON.stringify(input.error);
    const result = await this.pool.query<MessageRow>(
      `
        UPDATE chat_messages
        SET content = $3, status = $4, error = $5::jsonb
        WHERE session_id = $1
          AND request_id = $2
          AND role = 'assistant'
          AND status IN ('pending', 'streaming')
        RETURNING ${messageColumns}
      `,
      [input.sessionId, input.requestId, input.content, input.status, error],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : toConversationMessage(row);
  }

  public async recoverInterruptedAssistantMessages(error: ChatError): Promise<number> {
    const result = await this.pool.query<{ readonly id: string }>(
      `
        UPDATE chat_messages
        SET status = 'failed', error = $1::jsonb
        WHERE role = 'assistant' AND status IN ('pending', 'streaming')
        RETURNING id
      `,
      [JSON.stringify(error)],
    );

    return result.rows.length;
  }

  private async withTransaction<TValue>(operation: (client: PoolClient) => Promise<TValue>): Promise<TValue> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const value = await operation(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function toConversationSession(row: SessionRow): ConversationSession {
  return ConversationSessionSchema.parse({
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function toConversationSessionSummary(row: SessionSummaryRow): ConversationSessionSummary {
  return ConversationSessionSummarySchema.parse({
    ...toConversationSession(row),
    messageCount: toInteger(row.message_count),
  });
}

function toConversationMessage(row: MessageRow): ConversationMessage {
  return ConversationMessageSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    requestId: row.request_id,
    ordinal: toInteger(row.ordinal),
    role: row.role,
    status: row.status,
    content: row.content,
    ...(row.error === null ? {} : { error: ChatErrorSchema.parse(row.error) }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function toConversationTurn(session: SessionRow, messageRows: readonly MessageRow[]): ConversationTurn {
  const messages = messageRows.map(toConversationMessage);
  const userMessage = messages.find((message) => message.role === "user");
  const assistantMessage = messages.find((message) => message.role === "assistant");
  if (userMessage === undefined || assistantMessage === undefined || messages.length !== 2) {
    throw new Error("PostgreSQL returned an incomplete Arc conversation turn.");
  }

  return {
    session: toConversationSession(session),
    userMessage,
    assistantMessage,
  };
}

function toInteger(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("PostgreSQL returned an invalid Arc conversation ordinal.");
  }

  return parsed;
}
