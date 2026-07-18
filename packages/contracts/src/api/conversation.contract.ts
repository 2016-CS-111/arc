import { z } from "zod";

import { ChatErrorSchema } from "../realtime/chat-events.contract.js";

export const ConversationIdSchema = z.string().uuid();
export const ConversationTitleSchema = z.string().trim().min(1).max(120);
export const ConversationMessageRoleSchema = z.enum(["user", "assistant"]);
export const ConversationMessageStatusSchema = z.enum(["pending", "streaming", "completed", "cancelled", "failed"]);

export const ConversationMessageSchema = z.object({
  id: ConversationIdSchema,
  sessionId: ConversationIdSchema,
  requestId: z.string().min(1).max(160),
  ordinal: z.number().int().positive(),
  role: ConversationMessageRoleSchema,
  status: ConversationMessageStatusSchema,
  content: z.string().max(200_000),
  error: ChatErrorSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ConversationSessionSchema = z.object({
  id: ConversationIdSchema,
  title: ConversationTitleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ConversationSessionSummarySchema = ConversationSessionSchema.extend({
  messageCount: z.number().int().nonnegative(),
});

export const ConversationSessionSnapshotSchema = ConversationSessionSchema.extend({
  messages: z.array(ConversationMessageSchema).max(200),
});

export const CreateConversationSessionRequestSchema = z.object({
  title: ConversationTitleSchema.optional(),
});

export const RenameConversationSessionRequestSchema = z.object({
  title: ConversationTitleSchema,
});

export type ConversationId = z.infer<typeof ConversationIdSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ConversationMessageRole = z.infer<typeof ConversationMessageRoleSchema>;
export type ConversationMessageStatus = z.infer<typeof ConversationMessageStatusSchema>;
export type ConversationSession = z.infer<typeof ConversationSessionSchema>;
export type ConversationSessionSummary = z.infer<typeof ConversationSessionSummarySchema>;
export type ConversationSessionSnapshot = z.infer<typeof ConversationSessionSnapshotSchema>;
export type CreateConversationSessionRequest = z.infer<typeof CreateConversationSessionRequestSchema>;
export type RenameConversationSessionRequest = z.infer<typeof RenameConversationSessionRequestSchema>;
