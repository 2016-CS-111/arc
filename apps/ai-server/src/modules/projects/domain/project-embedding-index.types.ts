import type {
  ProjectEmbeddingIndex,
  ProjectEmbeddingIndexErrorCode,
  ProjectEmbeddingIndexLimitReason,
} from "@arc/contracts";

import type { SourceSymbolKind } from "./project-symbol-index.types.js";
import type { SourceCodeRange } from "./source-code.types.js";
import type {
  ProjectMetadataSearchQuery,
  ProjectSemanticSearchQuery,
  ProjectSemanticSearchRecord,
} from "./project-semantic-search.types.js";

export interface BeginProjectEmbeddingIndexInput {
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly symbolIndexRunId: string;
  readonly dependencyIndexRunId: string;
  readonly frameworkIndexRunId: string;
  readonly provider: "ollama";
  readonly model: string;
  readonly dimensions: number;
  readonly inputFormat: string;
  readonly chunkerIdentity: string;
}

export interface ReusableProjectEmbeddingChunk {
  readonly identityKey: string;
  readonly inputHash: string;
  readonly embedding: readonly number[];
}

export interface FindReusableProjectEmbeddingChunksInput {
  readonly projectId: string;
  readonly provider: "ollama";
  readonly model: string;
  readonly dimensions: number;
  readonly inputFormat: string;
  readonly chunkerIdentity: string;
}

export interface ProjectEmbeddingChunkPublication {
  readonly identityKey: string;
  readonly contentHash: string;
  readonly inputHash: string;
  readonly ownerSymbolId: string | null;
  readonly ownerSymbolIdentityKey: string | null;
  readonly ownerSymbolKind: SourceSymbolKind | null;
  readonly ownerSymbolName: string | null;
  readonly ownerSymbolQualifiedName: string | null;
  readonly range: SourceCodeRange;
  readonly embedding: readonly number[];
}

export interface ProjectEmbeddingFilePublication {
  readonly sourceFileId: string;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly status: "indexed" | "limited";
  readonly chunks: readonly ProjectEmbeddingChunkPublication[];
}

export interface PublishProjectEmbeddingIndexInput {
  readonly projectId: string;
  readonly embeddingIndexId: string;
  readonly provider: "ollama";
  readonly model: string;
  readonly dimensions: number;
  readonly inputFormat: string;
  readonly chunkerIdentity: string;
  readonly files: readonly ProjectEmbeddingFilePublication[];
  readonly embeddedChunkCount: number;
  readonly reusedChunkCount: number;
  readonly limitReasons: readonly ProjectEmbeddingIndexLimitReason[];
}

export interface ProjectEmbeddingIndexRepository {
  beginIndex(input: BeginProjectEmbeddingIndexInput): Promise<ProjectEmbeddingIndex>;
  findReusableChunks(input: FindReusableProjectEmbeddingChunksInput): Promise<readonly ReusableProjectEmbeddingChunk[]>;
  publishIndex(input: PublishProjectEmbeddingIndexInput): Promise<ProjectEmbeddingIndex>;
  failIndex(
    projectId: string,
    embeddingIndexId: string,
    errorCode: ProjectEmbeddingIndexErrorCode,
  ): Promise<ProjectEmbeddingIndex>;
  getLatestRun(projectId: string): Promise<ProjectEmbeddingIndex | null>;
  getCurrentCatalogRun(projectId: string): Promise<ProjectEmbeddingIndex | null>;
  searchSemantic(input: ProjectSemanticSearchQuery): Promise<readonly ProjectSemanticSearchRecord[]>;
  searchMetadata(input: ProjectMetadataSearchQuery): Promise<readonly ProjectSemanticSearchRecord[]>;
  recoverInterruptedIndexes(): Promise<number>;
}
