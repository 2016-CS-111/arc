import { z } from "zod";

import { ProjectRelativePathSchema } from "./project-ignore.contract.js";
import { ProjectIdSchema } from "./project.contract.js";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

export const ProjectSemanticSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(4_096),
  pathPrefix: ProjectRelativePathSchema.optional(),
  languages: z.array(z.string().trim().min(1).max(64)).max(10).default([]),
  limit: z.number().int().min(1).max(50).default(10),
});

export const ProjectSemanticSearchRangeSchema = z.object({
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  startLine: z.number().int().nonnegative(),
  startColumnByte: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  endColumnByte: z.number().int().nonnegative(),
});

export const ProjectSemanticSearchResultSchema = z.object({
  chunkId: z.string().uuid(),
  identityKey: Sha256Schema,
  sourceFileId: z.string().uuid(),
  path: ProjectRelativePathSchema,
  language: z.string().min(1).max(64),
  sourceHash: Sha256Schema,
  contentHash: Sha256Schema,
  range: ProjectSemanticSearchRangeSchema,
  symbol: z
    .object({
      id: z.string().uuid().nullable(),
      identityKey: Sha256Schema,
      kind: z.string().min(1).max(32),
      name: z.string().min(1).max(4_096),
      qualifiedName: z.string().min(1).max(4_096),
    })
    .nullable(),
  rank: z.number().int().positive(),
  score: z.number().finite().nonnegative(),
  denseRank: z.number().int().positive().nullable(),
  denseScore: z.number().finite().min(-1).max(1).nullable(),
  lexicalRank: z.number().int().positive().nullable(),
  lexicalScore: z.number().finite().nonnegative().nullable(),
});

export const ProjectSemanticSearchResponseSchema = z.object({
  projectId: ProjectIdSchema,
  embeddingIndexId: z.string().uuid(),
  sourceIndexRunId: z.string().uuid(),
  symbolIndexRunId: z.string().uuid(),
  dependencyIndexRunId: z.string().uuid(),
  frameworkIndexRunId: z.string().uuid(),
  model: z.string().min(1),
  dimensions: z.number().int().positive(),
  catalogLimited: z.boolean(),
  ranking: z.literal("rrf-v1"),
  rrfK: z.literal(60),
  candidateLimit: z.number().int().min(1).max(200),
  limit: z.number().int().min(1).max(50),
  truncated: z.boolean(),
  results: ProjectSemanticSearchResultSchema.array().max(50),
});

export type ProjectSemanticSearchRequest = z.infer<typeof ProjectSemanticSearchRequestSchema>;
export type ProjectSemanticSearchResponse = z.infer<typeof ProjectSemanticSearchResponseSchema>;
export type ProjectSemanticSearchResult = z.infer<typeof ProjectSemanticSearchResultSchema>;
