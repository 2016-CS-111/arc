import type { ReadyProjectSourceFile } from "./project-source-index.types.js";
import type { ProjectSymbolCatalogRecord, SourceSymbolKind } from "./project-symbol-index.types.js";
import type { SourceCodeRange } from "./source-code.types.js";

export const PROJECT_SOURCE_CHUNKER_IDENTITY = "arc-source-chunker-v1";
export const PROJECT_SOURCE_INPUT_FORMAT = "arc-source-v1";

export const DEFAULT_PROJECT_SOURCE_CHUNK_LIMITS = {
  maxChunksPerFile: 500,
  maxSourceBytes: 8_192,
} as const;

export interface ProjectSourceChunkLimits {
  readonly maxChunksPerFile: number;
  readonly maxSourceBytes: number;
}

export interface ProjectSourceChunkOwner {
  readonly id: string;
  readonly identityKey: string;
  readonly kind: SourceSymbolKind;
  readonly name: string;
  readonly qualifiedName: string;
}

export interface ProjectSourceChunk {
  readonly identityKey: string;
  readonly inputFormat: typeof PROJECT_SOURCE_INPUT_FORMAT;
  readonly inputHash: string;
  readonly contentHash: string;
  readonly embeddingInput: string;
  readonly language: string;
  readonly ordinal: number;
  readonly owner: ProjectSourceChunkOwner | null;
  readonly range: SourceCodeRange;
  readonly relativePath: string;
  readonly sourceBytes: number;
  readonly sourceFileId: string;
  readonly sourceHash: string;
}

export interface ProjectSourceChunkInput {
  readonly rootPath: string;
  readonly sourceFile: ReadyProjectSourceFile;
  readonly symbols: readonly ProjectSymbolCatalogRecord[];
  readonly limits?: ProjectSourceChunkLimits;
}

export interface ProjectSourceChunkResult {
  readonly chunkerIdentity: typeof PROJECT_SOURCE_CHUNKER_IDENTITY;
  readonly chunks: readonly ProjectSourceChunk[];
  readonly truncated: boolean;
}
