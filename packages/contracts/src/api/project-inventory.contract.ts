import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";
import { ProjectRelativePathSchema } from "./project-ignore.contract.js";

export const ProjectScanIdSchema = z.string().uuid();
export const ProjectScanStatusSchema = z.enum(["running", "completed", "limited", "failed"]);
export const ProjectScanLimitReasonSchema = z.enum(["file_count", "total_bytes", "depth"]);
export const ProjectScanErrorCodeSchema = z.enum(["filesystem_error", "inventory_persistence_error", "unknown_error"]);

export const ProjectFileMetadataSchema = z.object({
  path: ProjectRelativePathSchema,
  sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  modifiedAt: z.string().datetime(),
});

export const ProjectScanSchema = z.object({
  id: ProjectScanIdSchema,
  projectId: ProjectIdSchema,
  status: ProjectScanStatusSchema,
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ignoredPathCount: z.number().int().nonnegative(),
  skippedSymlinkCount: z.number().int().nonnegative(),
  limitReasons: ProjectScanLimitReasonSchema.array(),
  errorCode: ProjectScanErrorCodeSchema.nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const LatestProjectScanResponseSchema = z.object({
  scan: ProjectScanSchema.nullable(),
});

export type LatestProjectScanResponse = z.infer<typeof LatestProjectScanResponseSchema>;
export type ProjectFileMetadata = z.infer<typeof ProjectFileMetadataSchema>;
export type ProjectScan = z.infer<typeof ProjectScanSchema>;
export type ProjectScanErrorCode = z.infer<typeof ProjectScanErrorCodeSchema>;
export type ProjectScanLimitReason = z.infer<typeof ProjectScanLimitReasonSchema>;
export type ProjectScanStatus = z.infer<typeof ProjectScanStatusSchema>;
