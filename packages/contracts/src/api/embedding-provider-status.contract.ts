import { z } from "zod";

export const EmbeddingProviderStatusResponseSchema = z.object({
  provider: z.literal("ollama"),
  status: z.enum(["ready", "not_configured", "unreachable", "model_missing", "error"]),
  model: z.string().min(1).nullable(),
  dimensions: z.number().int().positive().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  message: z.string().min(1).optional(),
});

export type EmbeddingProviderStatusResponse = z.infer<typeof EmbeddingProviderStatusResponseSchema>;
