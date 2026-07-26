import { z } from "zod";

export const OllamaProviderStatusSchema = z.enum(["ready", "not_configured", "unreachable", "model_missing", "error"]);

export const OllamaProviderStatusResponseSchema = z.object({
  provider: z.literal("ollama"),
  status: OllamaProviderStatusSchema,
  model: z.string().min(1).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  message: z.string().min(1).optional(),
});

export type OllamaProviderStatus = z.infer<typeof OllamaProviderStatusSchema>;
export type OllamaProviderStatusResponse = z.infer<typeof OllamaProviderStatusResponseSchema>;
