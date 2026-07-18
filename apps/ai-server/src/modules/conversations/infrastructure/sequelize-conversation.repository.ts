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
import { Op, QueryTypes, Transaction } from "sequelize";

import type { ArcDatabase, ChatMessageAttributes, ChatSessionAttributes } from "../../../database/database.types.js";
import type { ChatMessageModel } from "../../../database/models/chat-message.model.js";
import type { ChatSessionModel } from "../../../database/models/chat-session.model.js";
import type { ConversationRepository } from "../application/conversation.repository.js";
import type {
  ConversationListOptions,
  ConversationTurn,
  CreateConversationSessionInput,
  CreateConversationTurnInput,
  UpdateAssistantMessageInput,
} from "../domain/conversation.types.js";

interface SessionSummaryRow {
  readonly id: string;
  readonly title: string;
  readonly messageCount: number | string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SequelizeConversationRepository implements ConversationRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async createSession(input: CreateConversationSessionInput): Promise<ConversationSession> {
    const session = await this.database.models.chatSessions.create(
      input.title === undefined ? {} : { title: input.title },
    );

    return toConversationSession(session);
  }

  public async ensureSession(sessionId: string): Promise<ConversationSession> {
    const [session] = await this.database.models.chatSessions.findOrCreate({
      where: { id: sessionId },
      defaults: { id: sessionId },
    });

    return toConversationSession(session);
  }

  public async listSessions(options: ConversationListOptions = {}): Promise<ConversationSessionSummary[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const rows = await this.database.sequelize.query<SessionSummaryRow>(
      `
        SELECT
          chat_sessions.id,
          chat_sessions.title,
          COUNT(chat_messages.id)::integer AS "messageCount",
          chat_sessions.created_at AS "createdAt",
          chat_sessions.updated_at AS "updatedAt"
        FROM chat_sessions
        LEFT JOIN chat_messages ON chat_messages.session_id = chat_sessions.id
        GROUP BY chat_sessions.id
        ORDER BY chat_sessions.updated_at DESC, chat_sessions.id DESC
        LIMIT $1
      `,
      {
        bind: [limit],
        type: QueryTypes.SELECT,
      },
    );

    return rows.map(toConversationSessionSummary);
  }

  public async getSession(sessionId: string): Promise<ConversationSessionSnapshot | undefined> {
    const session = await this.database.models.chatSessions.findByPk(sessionId);
    if (session === null) {
      return undefined;
    }

    const messages = await this.database.models.chatMessages.findAll({
      where: { sessionId },
      order: [["ordinal", "DESC"]],
      limit: 200,
    });

    return ConversationSessionSnapshotSchema.parse({
      ...toConversationSession(session),
      messages: messages.reverse().map(toConversationMessage),
    });
  }

  public async renameSession(sessionId: string, title: string): Promise<ConversationSession | undefined> {
    const session = await this.database.models.chatSessions.findByPk(sessionId);
    if (session === null) {
      return undefined;
    }

    session.set("title", title);
    await session.save();
    return toConversationSession(session);
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const deletedCount = await this.database.models.chatSessions.destroy({ where: { id: sessionId } });
    return deletedCount > 0;
  }

  public async createPendingTurn(input: CreateConversationTurnInput): Promise<ConversationTurn | undefined> {
    return this.database.sequelize.transaction(async (transaction) => {
      const session = await this.database.models.chatSessions.findByPk(input.sessionId, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (session === null) {
        return undefined;
      }

      const existingMessages = await this.database.models.chatMessages.findAll({
        where: {
          requestId: input.requestId,
          sessionId: input.sessionId,
        },
        order: [["ordinal", "ASC"]],
        transaction,
      });
      if (existingMessages.length > 0) {
        return toConversationTurn(session, existingMessages, false);
      }

      await session.increment("nextMessageOrdinal", { by: 2, transaction });
      await session.reload({ transaction, lock: Transaction.LOCK.UPDATE });
      const assistantOrdinal = toInteger(session.getDataValue("nextMessageOrdinal"));
      const userOrdinal = assistantOrdinal - 1;
      const messages = await this.database.models.chatMessages.bulkCreate(
        [
          {
            sessionId: input.sessionId,
            requestId: input.requestId,
            ordinal: userOrdinal,
            role: "user",
            status: "completed",
            content: input.userContent,
          },
          {
            sessionId: input.sessionId,
            requestId: input.requestId,
            ordinal: assistantOrdinal,
            role: "assistant",
            status: "pending",
            content: "",
          },
        ],
        { returning: true, transaction },
      );
      await session.reload({ transaction });

      return toConversationTurn(session, messages, true);
    });
  }

  public async updateAssistantMessage(input: UpdateAssistantMessageInput): Promise<ConversationMessage | undefined> {
    const [updatedCount, updatedMessages] = await this.database.models.chatMessages.update(
      {
        content: input.content,
        status: input.status,
        error: input.error ?? null,
      },
      {
        where: {
          requestId: input.requestId,
          role: "assistant",
          sessionId: input.sessionId,
          status: { [Op.in]: ["pending", "streaming"] },
        },
        returning: true,
      },
    );
    const message = updatedMessages[0];

    if (updatedCount === 0 || message === undefined) {
      return undefined;
    }

    return toConversationMessage(message);
  }

  public async recoverInterruptedAssistantMessages(error: ChatError): Promise<number> {
    const [updatedCount] = await this.database.models.chatMessages.update(
      {
        status: "failed",
        error,
      },
      {
        where: {
          role: "assistant",
          status: { [Op.in]: ["pending", "streaming"] },
        },
      },
    );

    return updatedCount;
  }
}

function toConversationSession(session: ChatSessionModel): ConversationSession {
  return toConversationSessionAttributes(session.get());
}

function toConversationSessionAttributes(attributes: ChatSessionAttributes): ConversationSession {
  return ConversationSessionSchema.parse({
    id: attributes.id,
    title: attributes.title,
    createdAt: attributes.createdAt.toISOString(),
    updatedAt: attributes.updatedAt.toISOString(),
  });
}

function toConversationSessionSummary(row: SessionSummaryRow): ConversationSessionSummary {
  return ConversationSessionSummarySchema.parse({
    id: row.id,
    title: row.title,
    messageCount: toInteger(row.messageCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toConversationMessage(message: ChatMessageModel): ConversationMessage {
  return toConversationMessageAttributes(message.get());
}

function toConversationMessageAttributes(attributes: ChatMessageAttributes): ConversationMessage {
  return ConversationMessageSchema.parse({
    id: attributes.id,
    sessionId: attributes.sessionId,
    requestId: attributes.requestId,
    ordinal: toInteger(attributes.ordinal),
    role: attributes.role,
    status: attributes.status,
    content: attributes.content,
    ...(attributes.error === null ? {} : { error: ChatErrorSchema.parse(attributes.error) }),
    createdAt: attributes.createdAt.toISOString(),
    updatedAt: attributes.updatedAt.toISOString(),
  });
}

function toConversationTurn(
  session: ChatSessionModel,
  messageModels: readonly ChatMessageModel[],
  created: boolean,
): ConversationTurn {
  const messages = messageModels.map(toConversationMessage);
  const userMessage = messages.find((message) => message.role === "user");
  const assistantMessage = messages.find((message) => message.role === "assistant");
  if (userMessage === undefined || assistantMessage === undefined || messages.length !== 2) {
    throw new Error("Sequelize returned an incomplete Arc conversation turn.");
  }

  return {
    created,
    session: toConversationSession(session),
    userMessage,
    assistantMessage,
  };
}

function toInteger(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Sequelize returned an invalid Arc conversation ordinal.");
  }

  return parsed;
}
