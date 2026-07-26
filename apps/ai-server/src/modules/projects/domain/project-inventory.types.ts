import type { ProjectFileMetadata, ProjectScanErrorCode, ProjectScanLimitReason } from "@arc/contracts";

export interface ProjectScanLimits {
  readonly maxFiles: number;
  readonly maxTotalBytes: number;
  readonly maxDepth: number;
}

export interface ProjectInventoryWalkResult {
  readonly files: ProjectFileMetadata[];
  readonly totalBytes: number;
  readonly ignoredPathCount: number;
  readonly skippedSymlinkCount: number;
  readonly limitReasons: ProjectScanLimitReason[];
}

export interface CompleteProjectScanInput extends ProjectInventoryWalkResult {
  readonly scanId: string;
  readonly projectId: string;
  readonly batchSize: number;
}

export interface FailProjectScanInput {
  readonly scanId: string;
  readonly projectId: string;
  readonly errorCode: ProjectScanErrorCode;
}
