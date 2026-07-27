import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";
import { ProjectScanIdSchema } from "./project-inventory.contract.js";

export const ProjectSourceIndexIdSchema = z.string().uuid();
export const ProjectSourceIndexStatusSchema = z.enum(["running", "completed", "limited", "failed"]);
export const ProjectSourceIndexLimitReasonSchema = z.enum(["total_bytes"]);
export const ProjectSourceIndexErrorCodeSchema = z.enum([
  "filesystem_error",
  "source_persistence_error",
  "index_interrupted",
  "unknown_error",
]);
export const ProjectSourceFileStatusSchema = z.enum(["ready", "skipped"]);
export const ProjectSourceFileSkipReasonSchema = z.enum([
  "ignored_since_scan",
  "inventory_stale",
  "file_missing",
  "file_too_large",
  "not_regular_file",
  "symbolic_link",
  "unsafe_path",
  "binary_content",
  "invalid_utf8",
  "file_changed_during_read",
  "file_read_error",
  "run_limit",
]);

export const ProjectSourceIndexSchema = z.object({
  id: ProjectSourceIndexIdSchema,
  projectId: ProjectIdSchema,
  inventoryScanId: ProjectScanIdSchema,
  status: ProjectSourceIndexStatusSchema,
  readyFileCount: z.number().int().nonnegative(),
  skippedFileCount: z.number().int().nonnegative(),
  inspectedBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  readyBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  limitReasons: ProjectSourceIndexLimitReasonSchema.array(),
  errorCode: ProjectSourceIndexErrorCodeSchema.nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const ProjectSourceCatalogSchema = z.object({
  sourceIndexId: ProjectSourceIndexIdSchema,
  inventoryScanId: ProjectScanIdSchema,
  readyFileCount: z.number().int().nonnegative(),
  skippedFileCount: z.number().int().nonnegative(),
  inspectedBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  readyBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  completedAt: z.string().datetime(),
  stale: z.boolean(),
});

export const LatestProjectSourceIndexResponseSchema = z.object({
  latestRun: ProjectSourceIndexSchema.nullable(),
  currentCatalog: ProjectSourceCatalogSchema.nullable(),
});

export type LatestProjectSourceIndexResponse = z.infer<typeof LatestProjectSourceIndexResponseSchema>;
export type ProjectSourceCatalog = z.infer<typeof ProjectSourceCatalogSchema>;
export type ProjectSourceFileSkipReason = z.infer<typeof ProjectSourceFileSkipReasonSchema>;
export type ProjectSourceFileStatus = z.infer<typeof ProjectSourceFileStatusSchema>;
export type ProjectSourceIndex = z.infer<typeof ProjectSourceIndexSchema>;
export type ProjectSourceIndexErrorCode = z.infer<typeof ProjectSourceIndexErrorCodeSchema>;
export type ProjectSourceIndexLimitReason = z.infer<typeof ProjectSourceIndexLimitReasonSchema>;
export type ProjectSourceIndexStatus = z.infer<typeof ProjectSourceIndexStatusSchema>;
