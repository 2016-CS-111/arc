import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";

const ContextTextSchema = z.string().trim().min(1).max(512);

export const CodeCompletionRequestSchema = z
  .object({
    imports: ContextTextSchema.array().max(20).default([]),
    language: z.string().trim().min(1).max(64),
    maxTokens: z.number().int().min(1).max(256).default(128),
    nearbySymbols: ContextTextSchema.array().max(16).default([]),
    path: z.string().trim().min(1).max(4_096).nullable().default(null),
    prefix: z.string().min(1).max(12_000),
    projectId: ProjectIdSchema.nullable().default(null),
    sourceVersion: z.number().int().nonnegative(),
    suffix: z.string().max(8_000),
  })
  .strict();

export const CodeCompletionResponseSchema = z
  .object({
    completion: z.string().max(8_192),
    latencyMs: z.number().int().nonnegative(),
    model: z.string().min(1).nullable(),
  })
  .strict();

export const CodeCompletionStatusSchema = z.enum([
  "ready",
  "not_configured",
  "unreachable",
  "model_missing",
  "unsupported",
  "error",
]);

export const CodeCompletionStatusResponseSchema = z
  .object({
    latencyMs: z.number().int().nonnegative().nullable(),
    message: z.string().min(1).optional(),
    model: z.string().min(1).nullable(),
    status: CodeCompletionStatusSchema,
    supportsFillInMiddle: z.boolean(),
  })
  .strict();

export type CodeCompletionRequest = z.infer<typeof CodeCompletionRequestSchema>;
export type CodeCompletionResponse = z.infer<typeof CodeCompletionResponseSchema>;
export type CodeCompletionStatus = z.infer<typeof CodeCompletionStatusSchema>;
export type CodeCompletionStatusResponse = z.infer<typeof CodeCompletionStatusResponseSchema>;
