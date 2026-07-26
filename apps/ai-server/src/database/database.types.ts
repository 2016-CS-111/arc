import type {
  ChatError,
  ConversationMessageRole,
  ConversationMessageStatus,
  ProjectScanErrorCode,
  ProjectScanLimitReason,
  ProjectScanStatus,
} from "@arc/contracts";
import type { ModelStatic, Optional, Sequelize } from "sequelize";

import type { ChatMessageModel } from "./models/chat-message.model.js";
import type { ChatSessionModel } from "./models/chat-session.model.js";
import type { ProjectFileModel } from "./models/project-file.model.js";
import type { ProjectModel } from "./models/project.model.js";
import type { ProjectScanModel } from "./models/project-scan.model.js";

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

export interface ProjectScanAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly status: ProjectScanStatus;
  readonly fileCount: number;
  readonly totalBytes: number | string;
  readonly ignoredPathCount: number;
  readonly skippedSymlinkCount: number;
  readonly limitReasons: ProjectScanLimitReason[];
  readonly errorCode: ProjectScanErrorCode | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export type ProjectScanCreationAttributes = Optional<
  ProjectScanAttributes,
  | "id"
  | "status"
  | "fileCount"
  | "totalBytes"
  | "ignoredPathCount"
  | "skippedSymlinkCount"
  | "limitReasons"
  | "errorCode"
  | "startedAt"
  | "completedAt"
>;

export interface ProjectFileAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly scanId: string;
  readonly relativePath: string;
  readonly sizeBytes: number | string;
  readonly modifiedAt: Date;
}

export type ProjectFileCreationAttributes = Optional<ProjectFileAttributes, "id">;

export interface ArcDatabaseModels {
  readonly chatSessions: ModelStatic<ChatSessionModel>;
  readonly chatMessages: ModelStatic<ChatMessageModel>;
  readonly projectFiles: ModelStatic<ProjectFileModel>;
  readonly projects: ModelStatic<ProjectModel>;
  readonly projectScans: ModelStatic<ProjectScanModel>;
}

export interface ArcDatabase {
  readonly sequelize: Sequelize;
  readonly models: ArcDatabaseModels;
}
