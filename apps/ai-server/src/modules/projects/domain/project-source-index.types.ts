import type {
  ProjectFileMetadata,
  ProjectSourceFileSkipReason,
  ProjectSourceIndex,
  ProjectSourceIndexErrorCode,
  ProjectSourceIndexLimitReason,
} from "@arc/contracts";

export interface SourceTextReadInput {
  readonly rootPath: string;
  readonly file: ProjectFileMetadata;
  readonly maxFileBytes: number;
}

export interface ReadySourceTextReadResult {
  readonly status: "ready";
  readonly content: string;
  readonly contentHash: string;
  readonly inspectedBytes: number;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
}

export interface SkippedSourceTextReadResult {
  readonly status: "skipped";
  readonly skipReason: ProjectSourceFileSkipReason;
  readonly inspectedBytes: number;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
}

export type SourceTextReadResult = ReadySourceTextReadResult | SkippedSourceTextReadResult;

export interface ProjectSourceFileOutcome {
  readonly relativePath: string;
  readonly status: "ready" | "skipped";
  readonly skipReason: ProjectSourceFileSkipReason | null;
  readonly contentHash: string | null;
  readonly language: string | null;
  readonly inspectedBytes: number;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
}

export interface ReadyProjectSourceFile {
  readonly id: string;
  readonly contentHash: string;
  readonly language: string;
  readonly modifiedAt: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
}

export interface ProjectSourceCatalogSnapshot {
  readonly files: readonly ReadyProjectSourceFile[];
  readonly run: ProjectSourceIndex;
}

export interface CompleteProjectSourceIndexInput {
  readonly sourceIndexId: string;
  readonly projectId: string;
  readonly inventoryScanId: string;
  readonly files: ProjectSourceFileOutcome[];
  readonly readyFileCount: number;
  readonly skippedFileCount: number;
  readonly inspectedBytes: number;
  readonly readyBytes: number;
  readonly limitReasons: ProjectSourceIndexLimitReason[];
  readonly batchSize: number;
}

export interface FailProjectSourceIndexInput {
  readonly sourceIndexId: string;
  readonly projectId: string;
  readonly errorCode: ProjectSourceIndexErrorCode;
}
