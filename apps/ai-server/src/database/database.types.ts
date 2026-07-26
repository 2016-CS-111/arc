import type { ChatError, ConversationMessageRole, ConversationMessageStatus } from "@arc/contracts";
import type { ModelStatic, Optional, Sequelize } from "sequelize";

import type { ChatMessageModel } from "./models/chat-message.model.js";
import type { ChatSessionModel } from "./models/chat-session.model.js";
import type { ProjectModel } from "./models/project.model.js";

export interface ChatSessionAttributes {
  readonly id: string;
  readonly title: string;
  readonly nextMessageOrdinal: number | string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ChatSessionCreationAttributes = Optional<
  ChatSessionAttributes,
  "id" | "title" | "nextMessageOrdinal" | "createdAt" | "updatedAt"
>;

export interface ChatMessageAttributes {
  readonly id: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly ordinal: number | string;
  readonly role: ConversationMessageRole;
  readonly status: ConversationMessageStatus;
  readonly content: string;
  readonly error: ChatError | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ChatMessageCreationAttributes = Optional<ChatMessageAttributes, "id" | "error" | "createdAt" | "updatedAt">;

export interface ProjectAttributes {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ProjectCreationAttributes = Optional<ProjectAttributes, "id" | "createdAt" | "updatedAt">;

export interface ArcDatabaseModels {
  readonly chatSessions: ModelStatic<ChatSessionModel>;
  readonly chatMessages: ModelStatic<ChatMessageModel>;
  readonly projects: ModelStatic<ProjectModel>;
}

export interface ArcDatabase {
  readonly sequelize: Sequelize;
  readonly models: ArcDatabaseModels;
}
