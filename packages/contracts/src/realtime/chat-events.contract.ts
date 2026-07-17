import { z } from "zod";

const ChatIdentifierSchema = z.string().min(1).max(160);

export const ChatTransportMessageRoleSchema = z.enum(["user", "assistant"]);

export const ChatTransportMessageSchema = z.object({
  role: ChatTransportMessageRoleSchema,
  content: z.string().min(1).max(20_000),
});

export const ChatSendCommandSchema = z
  .object({
    requestId: ChatIdentifierSchema,
    sessionId: ChatIdentifierSchema,
    messages: z.array(ChatTransportMessageSchema).min(1).max(40),
  })
  .refine((command) => command.messages.at(-1)?.role === "user", {
    message: "The final chat message must have the user role.",
    path: ["messages"],
  });

export const ChatCancelCommandSchema = z.object({
  requestId: ChatIdentifierSchema,
  sessionId: ChatIdentifierSchema,
});

export const ChatErrorCodeSchema = z.enum([
  "invalid_request",
  "session_busy",
  "generation_not_found",
  "provider_not_configured",
  "provider_unavailable",
  "model_missing",
  "generation_timeout",
  "generation_cancelled",
  "generation_failed",
]);

export const ChatErrorSchema = z.object({
  code: ChatErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
});

export const ChatAcceptedEventSchema = z.object({
  requestId: ChatIdentifierSchema,
  sessionId: ChatIdentifierSchema,
});

export const ChatDeltaEventSchema = z.object({
  requestId: ChatIdentifierSchema,
  sessionId: ChatIdentifierSchema,
  content: z.string().min(1),
});

export const ChatUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalDurationMs: z.number().nonnegative().optional(),
});

export const ChatCompletedEventSchema = z.object({
  requestId: ChatIdentifierSchema,
  sessionId: ChatIdentifierSchema,
  finishReason: z.string().min(1).optional(),
  usage: ChatUsageSchema.optional(),
});

export const ChatCancelledEventSchema = z.object({
  requestId: ChatIdentifierSchema,
  sessionId: ChatIdentifierSchema,
});

export const ChatErrorEventSchema = z.object({
  requestId: ChatIdentifierSchema,
  sessionId: ChatIdentifierSchema,
  error: ChatErrorSchema,
});

export type ChatSendCommand = z.infer<typeof ChatSendCommandSchema>;
export type ChatCancelCommand = z.infer<typeof ChatCancelCommandSchema>;
export type ChatErrorCode = z.infer<typeof ChatErrorCodeSchema>;
export type ChatError = z.infer<typeof ChatErrorSchema>;
export type ChatAcceptedEvent = z.infer<typeof ChatAcceptedEventSchema>;
export type ChatDeltaEvent = z.infer<typeof ChatDeltaEventSchema>;
export type ChatCompletedEvent = z.infer<typeof ChatCompletedEventSchema>;
export type ChatCancelledEvent = z.infer<typeof ChatCancelledEventSchema>;
export type ChatErrorEvent = z.infer<typeof ChatErrorEventSchema>;
