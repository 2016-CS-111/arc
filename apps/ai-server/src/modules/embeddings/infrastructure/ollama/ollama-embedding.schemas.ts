import { z } from "zod";

export const OllamaEmbeddingResponseSchema = z.object({
  model: z.string().min(1),
  embeddings: z.array(z.array(z.number())),
});

export const OllamaEmbeddingShowResponseSchema = z.object({}).passthrough();
