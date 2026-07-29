import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";

export const ProjectEmbeddingIndexStatusSchema = z.enum(["running", "completed", "limited", "failed"]);
export const ProjectEmbeddingIndexLimitReasonSchema = z.enum([
  "source_catalog_limited",
  "symbol_catalog_limited",
  "dependency_catalog_limited",
  "framework_catalog_limited",
  "file_chunks",
  "total_chunks",
]);
export const ProjectEmbeddingIndexErrorCodeSchema = z.enum([
  "provider_unavailable",
  "upstream_catalog_changed",
  "embedding_failed",
  "embedding_persistence_error",
  "index_interrupted",
]);

export const ProjectEmbeddingIndexSchema = z.object({
  id: z.string().uuid(),
  projectId: ProjectIdSchema,
  sourceIndexRunId: z.string().uuid(),
  symbolIndexRunId: z.string().uuid(),
  dependencyIndexRunId: z.string().uuid(),
  frameworkIndexRunId: z.string().uuid(),
  status: ProjectEmbeddingIndexStatusSchema,
  provider: z.literal("ollama"),
  model: z.string().min(1),
  dimensions: z.number().int().positive(),
  inputFormat: z.string().min(1),
  chunkerIdentity: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  embeddedChunkCount: z.number().int().nonnegative(),
  reusedChunkCount: z.number().int().nonnegative(),
  limitReasons: ProjectEmbeddingIndexLimitReasonSchema.array(),
  errorCode: ProjectEmbeddingIndexErrorCodeSchema.nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const ProjectEmbeddingCatalogStatusSchema = ProjectEmbeddingIndexSchema.and(z.object({ stale: z.boolean() }));

export const LatestProjectEmbeddingIndexResponseSchema = z.object({
  latestRun: ProjectEmbeddingIndexSchema.nullable(),
  currentCatalog: ProjectEmbeddingCatalogStatusSchema.nullable(),
});

export type LatestProjectEmbeddingIndexResponse = z.infer<typeof LatestProjectEmbeddingIndexResponseSchema>;
export type ProjectEmbeddingIndex = z.infer<typeof ProjectEmbeddingIndexSchema>;
export type ProjectEmbeddingIndexErrorCode = z.infer<typeof ProjectEmbeddingIndexErrorCodeSchema>;
export type ProjectEmbeddingIndexLimitReason = z.infer<typeof ProjectEmbeddingIndexLimitReasonSchema>;
