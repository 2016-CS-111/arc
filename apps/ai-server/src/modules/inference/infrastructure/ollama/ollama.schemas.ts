import { z } from "zod";

import { ChatModelError } from "../../domain/chat-model.errors.js";

const OllamaApiErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .passthrough();

export const OllamaShowResponseSchema = z
  .object({
    capabilities: z.array(z.string()).optional(),
    details: z.object({
      family: z.string().optional(),
      parameter_size: z.string().optional(),
      quantization_level: z.string().optional(),
    }),
    modified_at: z.string().optional(),
  })
  .passthrough();

const OllamaChatResponseSchema = z
  .object({
    created_at: z.string(),
    done: z.boolean(),
    done_reason: z.string().optional(),
    eval_count: z.number().int().nonnegative().optional(),
    message: z
      .object({
        content: z.string().default(""),
        role: z.string(),
        thinking: z.string().optional(),
        tool_calls: z
          .array(
            z
              .object({
                function: z
                  .object({
                    arguments: z.record(z.unknown()),
                    name: z.string().min(1).max(160),
                  })
                  .passthrough(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
    model: z.string().min(1),
    prompt_eval_count: z.number().int().nonnegative().optional(),
    total_duration: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type OllamaChatResponse = z.infer<typeof OllamaChatResponseSchema>;

export type OllamaStreamRecord =
  | {
      readonly kind: "error";
      readonly message: string;
    }
  | {
      readonly kind: "chat";
      readonly response: OllamaChatResponse;
    };

export function parseOllamaStreamRecord(value: unknown): OllamaStreamRecord {
  const errorResponse = OllamaApiErrorSchema.safeParse(value);
  if (errorResponse.success) {
    return {
      kind: "error",
      message: errorResponse.data.error,
    };
  }

  const chatResponse = OllamaChatResponseSchema.safeParse(value);
  if (!chatResponse.success) {
    throw new ChatModelError("OLLAMA_PROTOCOL_ERROR", "Ollama returned an invalid streaming response.", {
      cause: chatResponse.error,
    });
  }

  return {
    kind: "chat",
    response: chatResponse.data,
  };
}
