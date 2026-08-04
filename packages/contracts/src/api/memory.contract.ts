import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";

export const MemoryIdSchema = z.string().uuid();
export const MemoryScopeSchema = z.enum(["user", "project"]);
export const MemoryKindSchema = z.enum(["user", "project", "architecture", "convention", "decision", "business_rule"]);
export const MemoryProvenanceSchema = z.enum(["manual", "assistant", "import"]);
export const MemoryContentSchema = z.string().trim().min(1).max(2_000);
export const MemoryConfidenceSchema = z.number().min(0).max(1);

export const MemoryDraftSchema = z.object({
  content: MemoryContentSchema,
  confidence: MemoryConfidenceSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  kind: MemoryKindSchema,
  pinned: z.boolean().optional(),
  projectId: ProjectIdSchema.optional(),
  scope: MemoryScopeSchema,
});

export const MemoryRecordSchema = MemoryDraftSchema.extend({
  confidence: MemoryConfidenceSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  id: MemoryIdSchema,
  pinned: z.boolean(),
  projectId: ProjectIdSchema.nullable(),
  provenance: MemoryProvenanceSchema,
  updatedAt: z.string().datetime(),
  usedAt: z.string().datetime().nullable(),
});

export const CreateMemoryRequestSchema = MemoryDraftSchema;

export const UpdateMemoryRequestSchema = z.object({
  content: MemoryContentSchema.optional(),
  confidence: MemoryConfidenceSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  kind: MemoryKindSchema.optional(),
  pinned: z.boolean().optional(),
});

export const ListMemoriesQuerySchema = z.object({
  includeExpired: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  projectId: ProjectIdSchema.optional(),
});

export const MemoryProposalRequestSchema = MemoryDraftSchema.omit({ projectId: true });

export const MemoryProposalSchema = z.object({
  candidate: MemoryDraftSchema,
  createdAt: z.string().datetime(),
  id: MemoryIdSchema,
  memoryId: MemoryIdSchema.nullable(),
  requestId: z.string().min(1).max(160),
  sessionId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected"]),
  updatedAt: z.string().datetime(),
});

export const MemoryExportSchema = z.object({
  records: z.array(MemoryRecordSchema).max(200),
  version: z.literal(1),
});

export const ImportMemoriesRequestSchema = z.object({
  records: z.array(MemoryDraftSchema).min(1).max(200),
});

export type CreateMemoryRequest = z.infer<typeof CreateMemoryRequestSchema>;
export type ImportMemoriesRequest = z.infer<typeof ImportMemoriesRequestSchema>;
export type ListMemoriesQuery = z.infer<typeof ListMemoriesQuerySchema>;
export type MemoryDraft = z.infer<typeof MemoryDraftSchema>;
export type MemoryExport = z.infer<typeof MemoryExportSchema>;
export type MemoryKind = z.infer<typeof MemoryKindSchema>;
export type MemoryProvenance = z.infer<typeof MemoryProvenanceSchema>;
export type MemoryProposal = z.infer<typeof MemoryProposalSchema>;
export type MemoryProposalRequest = z.infer<typeof MemoryProposalRequestSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequestSchema>;
