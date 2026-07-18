import type { ChatError } from "@arc/contracts";
import type { Transaction } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import type {
  ArcDatabase,
  ChatMessageAttributes,
  ChatMessageModel,
  ChatSessionAttributes,
  ChatSessionModel,
} from "../../../database/database.types.js";
import { SequelizeConversationRepository } from "./sequelize-conversation.repository.js";

const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";
const requestId = "3b7acbf0-c8f4-4f27-a537-0b6ac906531a";
const timestamp = new Date("2026-07-18T08:00:00.000Z");

const sessionAttributes: ChatSessionAttributes = {
  id: sessionId,
  title: "New conversation",
  nextMessageOrdinal: 2,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const existingTurnAttributes: ChatMessageAttributes[] = [
  {
    id: "e97367c1-c595-4aa2-b8d9-a852cbbd69a4",
    sessionId,
    requestId,
    ordinal: 1,
    role: "user",
    status: "completed",
    content: "Hello",
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "1d089847-4de9-41c0-af93-3d7411a6068e",
    sessionId,
    requestId,
    ordinal: 2,
    role: "assistant",
    status: "streaming",
    content: "Hi",
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function createSession(attributes: ChatSessionAttributes): ChatSessionModel {
  return {
    get: (): ChatSessionAttributes => attributes,
  } as unknown as ChatSessionModel;
}

function createMessage(attributes: ChatMessageAttributes): ChatMessageModel {
  return {
    get: (): ChatMessageAttributes => attributes,
  } as unknown as ChatMessageModel;
}

function createDatabase(): {
  readonly database: ArcDatabase;
  readonly findByPk: ReturnType<typeof vi.fn>;
  readonly findAll: ReturnType<typeof vi.fn>;
  readonly increment: ReturnType<typeof vi.fn>;
  readonly query: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
} {
  const session = createSession(sessionAttributes);
  const increment = vi.fn();
  Object.assign(session, { increment });
  const findByPk = vi.fn(() => Promise.resolve(session));
  const findAll = vi.fn(() => Promise.resolve(existingTurnAttributes.map(createMessage)));
  const query = vi.fn(() => Promise.resolve([]));
  const update = vi.fn(() => Promise.resolve([0, []]));
  const transaction = vi.fn((operation: (transaction: Transaction) => Promise<unknown>) =>
    operation({} as Transaction),
  );

  return {
    database: {
      sequelize: { query, transaction } as unknown as ArcDatabase["sequelize"],
      models: {
        chatSessions: { findByPk } as unknown as ArcDatabase["models"]["chatSessions"],
        chatMessages: { findAll, update } as unknown as ArcDatabase["models"]["chatMessages"],
      },
    },
    findByPk,
    findAll,
    increment,
    query,
    update,
  };
}

describe("SequelizeConversationRepository", () => {
  it("returns an existing request turn without allocating duplicate message ordinals", async () => {
    const { database, increment } = createDatabase();
    const repository = new SequelizeConversationRepository(database);

    await expect(repository.createPendingTurn({ sessionId, requestId, userContent: "Hello" })).resolves.toMatchObject({
      session: { id: sessionId },
      userMessage: { content: "Hello", ordinal: 1 },
      assistantMessage: { content: "Hi", ordinal: 2, status: "streaming" },
    });
    expect(increment).not.toHaveBeenCalled();
  });

  it("maps PostgreSQL session counts through Sequelize's parameterized query API", async () => {
    const { database, query } = createDatabase();
    query.mockReturnValue(
      Promise.resolve([
        {
          id: sessionId,
          title: "New conversation",
          messageCount: "2",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]),
    );
    const repository = new SequelizeConversationRepository(database);

    await expect(repository.listSessions({ limit: 5 })).resolves.toMatchObject([{ id: sessionId, messageCount: 2 }]);
    expect(query).toHaveBeenCalledOnce();
  });

  it("marks interrupted assistant messages as failed through the chat message model", async () => {
    const { database, update } = createDatabase();
    update.mockReturnValue(Promise.resolve([2, []]));
    const repository = new SequelizeConversationRepository(database);
    const error: ChatError = {
      code: "generation_failed",
      message: "Generation interrupted by an Arc backend restart.",
      retryable: true,
    };

    await expect(repository.recoverInterruptedAssistantMessages(error)).resolves.toBe(2);
    expect(update).toHaveBeenCalledOnce();
  });
});
