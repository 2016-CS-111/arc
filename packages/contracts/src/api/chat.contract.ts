import { z } from "zod";

export const ChatRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: ChatRoleSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
});

export const ChatRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  messages: z.array(ChatMessageSchema).min(1),
});

export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("token"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("done"),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export type ChatRole = z.infer<typeof ChatRoleSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
