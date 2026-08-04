import type {
  ChatError,
  ConversationMessageRole,
  ConversationMessageStatus,
  ProjectDependencyFileErrorCode,
  ProjectDependencyFileStatus,
  ProjectDependencyIndexErrorCode,
  ProjectDependencyIndexLimitReason,
  ProjectDependencyIndexStatus,
  ProjectDependencyResolutionKind,
  ProjectDependencyResolverWarningCode,
  ProjectEmbeddingIndexErrorCode,
  ProjectEmbeddingIndexLimitReason,
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
import type {
  SourceDependencyBindingKind,
  SourceDependencyKind,
} from "../modules/projects/domain/project-dependency-index.types.js";
import type { ProjectModuleUnresolvedReason } from "../modules/projects/domain/project-module-resolution.types.js";
import type { ChatMessageModel } from "./models/chat-message.model.js";
import type { ChatSessionModel } from "./models/chat-session.model.js";
import type { ProjectDependencyBindingModel } from "./models/project-dependency-binding.model.js";
import type { ProjectDependencyEdgeModel } from "./models/project-dependency-edge.model.js";
import type { ProjectDependencyFileModel } from "./models/project-dependency-file.model.js";
import type { ProjectDependencyIndexRunModel } from "./models/project-dependency-index-run.model.js";
import type { ProjectFileModel } from "./models/project-file.model.js";
import type { ProjectModel } from "./models/project.model.js";
import type { ProjectScanModel } from "./models/project-scan.model.js";
import type { ProjectSourceFileModel } from "./models/project-source-file.model.js";
import type { ProjectSourceIndexRunModel } from "./models/project-source-index-run.model.js";
import type { ProjectSymbolFileModel } from "./models/project-symbol-file.model.js";
import type { ProjectSymbolIndexRunModel } from "./models/project-symbol-index-run.model.js";
import type { ProjectSymbolModel } from "./models/project-symbol.model.js";
import type { ProjectFrameworkIndexRunModel } from "./models/project-framework-index-run.model.js";
import type { ProjectFrameworkScopeModel } from "./models/project-framework-scope.model.js";
import type { ProjectFrameworkFileModel } from "./models/project-framework-file.model.js";
import type { ProjectFrameworkEntityModel } from "./models/project-framework-entity.model.js";
import type { ProjectFrameworkRelationshipModel } from "./models/project-framework-relationship.model.js";
import type { ProjectEmbeddingChunkModel } from "./models/project-embedding-chunk.model.js";
import type { ProjectEmbeddingFileModel } from "./models/project-embedding-file.model.js";
import type { ProjectEmbeddingIndexRunModel } from "./models/project-embedding-index-run.model.js";

export interface ProjectEmbeddingIndexRunAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly symbolIndexRunId: string;
  readonly dependencyIndexRunId: string;
  readonly frameworkIndexRunId: string;
  readonly status: "running" | "completed" | "limited" | "failed";
  readonly provider: "ollama";
  readonly model: string;
  readonly dimensions: number;
  readonly inputFormat: string;
  readonly chunkerIdentity: string;
  readonly fileCount: number;
  readonly chunkCount: number;
  readonly embeddedChunkCount: number;
  readonly reusedChunkCount: number;
  readonly limitReasons: ProjectEmbeddingIndexLimitReason[];
  readonly errorCode: ProjectEmbeddingIndexErrorCode | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export type ProjectEmbeddingIndexRunCreationAttributes = Optional<
  ProjectEmbeddingIndexRunAttributes,
  | "id"
  | "status"
  | "fileCount"
  | "chunkCount"
  | "embeddedChunkCount"
  | "reusedChunkCount"
  | "limitReasons"
  | "errorCode"
  | "startedAt"
  | "completedAt"
>;

export interface ProjectEmbeddingFileAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly embeddingIndexRunId: string;
  readonly sourceFileId: string;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly status: "indexed" | "limited";
  readonly chunkCount: number;
  readonly indexedAt: Date;
}

export type ProjectEmbeddingFileCreationAttributes = Optional<
  ProjectEmbeddingFileAttributes,
  "id" | "chunkCount" | "indexedAt"
>;

export interface ProjectEmbeddingChunkAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly embeddingIndexRunId: string;
  readonly embeddingFileId: string;
  readonly sourceFileId: string;
  readonly identityKey: string;
  readonly relativePath: string;
  readonly language: string;
  readonly sourceContentHash: string;
  readonly contentHash: string;
  readonly inputHash: string;
  readonly inputFormat: string;
  readonly provider: "ollama";
  readonly model: string;
  readonly dimensions: number;
  readonly ownerSymbolId: string | null;
  readonly ownerSymbolIdentityKey: string | null;
  readonly ownerSymbolKind: SourceSymbolKind | null;
  readonly ownerSymbolName: string | null;
  readonly ownerSymbolQualifiedName: string | null;
  readonly startByte: number;
  readonly endByte: number;
  readonly startLine: number;
  readonly startColumnByte: number;
  readonly endLine: number;
  readonly endColumnByte: number;
  readonly embedding: number[];
}

export type ProjectEmbeddingChunkCreationAttributes = Optional<ProjectEmbeddingChunkAttributes, "id">;

export interface ProjectFrameworkIndexRunAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly symbolIndexRunId: string;
  readonly dependencyIndexRunId: string;
  readonly status: "running" | "completed" | "limited" | "failed";
  readonly analyzerSetIdentity: string;
  readonly scopeCount: number;
  readonly analyzedFileCount: number;
  readonly reusedFileCount: number;
  readonly unsupportedFileCount: number;
  readonly failedFileCount: number;
  readonly entityCount: number;
  readonly relationshipCount: number;
  readonly unresolvedRelationshipCount: number;
  readonly omissionCount: number;
  readonly limitReasons: string[];
  readonly warnings: string[];
  readonly errorCode: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}
export type ProjectFrameworkIndexRunCreationAttributes = Optional<
  ProjectFrameworkIndexRunAttributes,
  | "id"
  | "status"
  | "scopeCount"
  | "analyzedFileCount"
  | "reusedFileCount"
  | "unsupportedFileCount"
  | "failedFileCount"
  | "entityCount"
  | "relationshipCount"
  | "unresolvedRelationshipCount"
  | "omissionCount"
  | "limitReasons"
  | "warnings"
  | "errorCode"
  | "startedAt"
  | "completedAt"
>;

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

export interface ProjectDependencyIndexRunAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly status: ProjectDependencyIndexStatus;
  readonly resolutionContextHash: string | null;
  readonly parsedFileCount: number;
  readonly reusedFileCount: number;
  readonly unsupportedFileCount: number;
  readonly failedFileCount: number;
  readonly edgeCount: number;
  readonly bindingCount: number;
  readonly omittedEdgeCount: number;
  readonly omittedBindingCount: number;
  readonly localEdgeCount: number;
  readonly externalEdgeCount: number;
  readonly builtinEdgeCount: number;
  readonly unresolvedEdgeCount: number;
  readonly limitReasons: ProjectDependencyIndexLimitReason[];
  readonly resolverWarnings: ProjectDependencyResolverWarningCode[];
  readonly errorCode: ProjectDependencyIndexErrorCode | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export type ProjectDependencyIndexRunCreationAttributes = Optional<
  ProjectDependencyIndexRunAttributes,
  | "id"
  | "status"
  | "resolutionContextHash"
  | "parsedFileCount"
  | "reusedFileCount"
  | "unsupportedFileCount"
  | "failedFileCount"
  | "edgeCount"
  | "bindingCount"
  | "omittedEdgeCount"
  | "omittedBindingCount"
  | "localEdgeCount"
  | "externalEdgeCount"
  | "builtinEdgeCount"
  | "unresolvedEdgeCount"
  | "limitReasons"
  | "resolverWarnings"
  | "errorCode"
  | "startedAt"
  | "completedAt"
>;

export interface ProjectDependencyFileAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly dependencyIndexRunId: string;
  readonly sourceFileId: string;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly extractorIdentity: string;
  readonly status: ProjectDependencyFileStatus;
  readonly hasSyntaxErrors: boolean;
  readonly edgeCount: number;
  readonly bindingCount: number;
  readonly omittedEdgeCount: number;
  readonly omittedBindingCount: number;
  readonly errorCode: ProjectDependencyFileErrorCode | null;
  readonly extractedAt: Date;
}

export type ProjectDependencyFileCreationAttributes = Optional<
  ProjectDependencyFileAttributes,
  | "id"
  | "hasSyntaxErrors"
  | "edgeCount"
  | "bindingCount"
  | "omittedEdgeCount"
  | "omittedBindingCount"
  | "errorCode"
  | "extractedAt"
>;

export interface ProjectDependencyEdgeAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly dependencyIndexRunId: string;
  readonly dependencyFileId: string;
  readonly sourceFileId: string;
  readonly extractionKey: string;
  readonly kind: SourceDependencyKind;
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly resolutionKind: ProjectDependencyResolutionKind;
  readonly targetSourceFileId: string | null;
  readonly targetRelativePath: string | null;
  readonly externalPackage: string | null;
  readonly unresolvedReason: ProjectModuleUnresolvedReason | null;
  readonly startByte: number;
  readonly endByte: number;
  readonly startLine: number;
  readonly startColumnByte: number;
  readonly endLine: number;
  readonly endColumnByte: number;
  readonly specifierStartByte: number;
  readonly specifierEndByte: number;
  readonly specifierStartLine: number;
  readonly specifierStartColumnByte: number;
  readonly specifierEndLine: number;
  readonly specifierEndColumnByte: number;
}

export type ProjectDependencyEdgeCreationAttributes = Optional<ProjectDependencyEdgeAttributes, "id" | "typeOnly">;

export interface ProjectDependencyBindingAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly dependencyIndexRunId: string;
  readonly dependencyEdgeId: string;
  readonly sourceFileId: string;
  readonly bindingKey: string;
  readonly kind: SourceDependencyBindingKind;
  readonly importedName: string | null;
  readonly localName: string | null;
  readonly exportedName: string | null;
  readonly typeOnly: boolean;
  readonly startByte: number | null;
  readonly endByte: number | null;
  readonly startLine: number | null;
  readonly startColumnByte: number | null;
  readonly endLine: number | null;
  readonly endColumnByte: number | null;
}

export type ProjectDependencyBindingCreationAttributes = Optional<
  ProjectDependencyBindingAttributes,
  "id" | "typeOnly"
>;

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
  readonly projectEmbeddingIndexRuns: ModelStatic<ProjectEmbeddingIndexRunModel>;
  readonly projectEmbeddingFiles: ModelStatic<ProjectEmbeddingFileModel>;
  readonly projectEmbeddingChunks: ModelStatic<ProjectEmbeddingChunkModel>;
  readonly projectFrameworkIndexRuns: ModelStatic<ProjectFrameworkIndexRunModel>;
  readonly projectFrameworkScopes: ModelStatic<ProjectFrameworkScopeModel>;
  readonly projectFrameworkFiles: ModelStatic<ProjectFrameworkFileModel>;
  readonly projectFrameworkEntities: ModelStatic<ProjectFrameworkEntityModel>;
  readonly projectFrameworkRelationships: ModelStatic<ProjectFrameworkRelationshipModel>;
  readonly chatSessions: ModelStatic<ChatSessionModel>;
  readonly projectDependencyBindings: ModelStatic<ProjectDependencyBindingModel>;
  readonly projectDependencyEdges: ModelStatic<ProjectDependencyEdgeModel>;
  readonly projectDependencyFiles: ModelStatic<ProjectDependencyFileModel>;
  readonly projectDependencyIndexRuns: ModelStatic<ProjectDependencyIndexRunModel>;
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
