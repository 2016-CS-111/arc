import type {
  ChatError,
  ConversationMessageRole,
  ConversationMessageStatus,
  ProjectScanErrorCode,
  ProjectScanLimitReason,
  ProjectScanStatus,
  ProjectSourceFileSkipReason,
  ProjectSourceFileStatus,
  ProjectSourceIndexErrorCode,
  ProjectSourceIndexLimitReason,
  ProjectSourceIndexStatus,
  ProjectSymbolFileErrorCode,
  ProjectSymbolFileStatus,
  ProjectSymbolIndexErrorCode,
  ProjectSymbolIndexLimitReason,
  ProjectSymbolIndexStatus,
} from "@arc/contracts";
import type { ModelStatic, Optional, Sequelize } from "sequelize";

import type { SourceSymbolKind } from "../modules/projects/domain/project-symbol-index.types.js";
import type { ChatMessageModel } from "./models/chat-message.model.js";
import type { ChatSessionModel } from "./models/chat-session.model.js";
import type { ProjectFileModel } from "./models/project-file.model.js";
import type { ProjectModel } from "./models/project.model.js";
import type { ProjectScanModel } from "./models/project-scan.model.js";
import type { ProjectSourceFileModel } from "./models/project-source-file.model.js";
import type { ProjectSourceIndexRunModel } from "./models/project-source-index-run.model.js";
import type { ProjectSymbolFileModel } from "./models/project-symbol-file.model.js";
import type { ProjectSymbolIndexRunModel } from "./models/project-symbol-index-run.model.js";
import type { ProjectSymbolModel } from "./models/project-symbol.model.js";

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

export interface ProjectSourceIndexRunAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly inventoryScanId: string;
  readonly status: ProjectSourceIndexStatus;
  readonly readyFileCount: number;
  readonly skippedFileCount: number;
  readonly inspectedBytes: number | string;
  readonly readyBytes: number | string;
  readonly limitReasons: ProjectSourceIndexLimitReason[];
  readonly errorCode: ProjectSourceIndexErrorCode | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export type ProjectSourceIndexRunCreationAttributes = Optional<
  ProjectSourceIndexRunAttributes,
  | "id"
  | "status"
  | "readyFileCount"
  | "skippedFileCount"
  | "inspectedBytes"
  | "readyBytes"
  | "limitReasons"
  | "errorCode"
  | "startedAt"
  | "completedAt"
>;

export interface ProjectSourceFileAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly inventoryScanId: string;
  readonly relativePath: string;
  readonly status: ProjectSourceFileStatus;
  readonly skipReason: ProjectSourceFileSkipReason | null;
  readonly contentHash: string | null;
  readonly language: string | null;
  readonly sizeBytes: number | string;
  readonly modifiedAt: Date;
  readonly indexedAt: Date;
}

export type ProjectSourceFileCreationAttributes = Optional<ProjectSourceFileAttributes, "id" | "indexedAt">;

export interface ProjectSymbolIndexRunAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly status: ProjectSymbolIndexStatus;
  readonly parsedFileCount: number;
  readonly reusedFileCount: number;
  readonly unsupportedFileCount: number;
  readonly failedFileCount: number;
  readonly symbolCount: number;
  readonly omittedSymbolCount: number;
  readonly limitReasons: ProjectSymbolIndexLimitReason[];
  readonly errorCode: ProjectSymbolIndexErrorCode | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export type ProjectSymbolIndexRunCreationAttributes = Optional<
  ProjectSymbolIndexRunAttributes,
  | "id"
  | "status"
  | "parsedFileCount"
  | "reusedFileCount"
  | "unsupportedFileCount"
  | "failedFileCount"
  | "symbolCount"
  | "omittedSymbolCount"
  | "limitReasons"
  | "errorCode"
  | "startedAt"
  | "completedAt"
>;

export interface ProjectSymbolFileAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly symbolIndexRunId: string;
  readonly sourceFileId: string;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly parserIdentity: string;
  readonly status: ProjectSymbolFileStatus;
  readonly hasSyntaxErrors: boolean;
  readonly symbolCount: number;
  readonly omittedSymbolCount: number;
  readonly errorCode: ProjectSymbolFileErrorCode | null;
  readonly parsedAt: Date;
}

export type ProjectSymbolFileCreationAttributes = Optional<
  ProjectSymbolFileAttributes,
  "id" | "hasSyntaxErrors" | "symbolCount" | "omittedSymbolCount" | "errorCode" | "parsedAt"
>;

export interface ProjectSymbolAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly symbolIndexRunId: string;
  readonly symbolFileId: string;
  readonly sourceFileId: string;
  readonly identityKey: string;
  readonly parentIdentityKey: string | null;
  readonly kind: SourceSymbolKind;
  readonly name: string;
  readonly qualifiedName: string;
  readonly exported: boolean;
  readonly startByte: number;
  readonly endByte: number;
  readonly startLine: number;
  readonly startColumnByte: number;
  readonly endLine: number;
  readonly endColumnByte: number;
}

export type ProjectSymbolCreationAttributes = Optional<ProjectSymbolAttributes, "id" | "exported">;

export interface ArcDatabaseModels {
  readonly chatSessions: ModelStatic<ChatSessionModel>;
  readonly chatMessages: ModelStatic<ChatMessageModel>;
  readonly projectFiles: ModelStatic<ProjectFileModel>;
  readonly projects: ModelStatic<ProjectModel>;
  readonly projectScans: ModelStatic<ProjectScanModel>;
  readonly projectSourceFiles: ModelStatic<ProjectSourceFileModel>;
  readonly projectSourceIndexRuns: ModelStatic<ProjectSourceIndexRunModel>;
  readonly projectSymbolFiles: ModelStatic<ProjectSymbolFileModel>;
  readonly projectSymbolIndexRuns: ModelStatic<ProjectSymbolIndexRunModel>;
  readonly projectSymbols: ModelStatic<ProjectSymbolModel>;
}

export interface ArcDatabase {
  readonly sequelize: Sequelize;
  readonly models: ArcDatabaseModels;
}
