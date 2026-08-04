import {
  ConversationIdSchema,
  ConversationSessionSummarySchema,
  EditProposalSchema,
  HealthResponseSchema,
  MemoryDraftSchema,
  MemoryExportSchema,
  MemoryIdSchema,
  MemoryProposalSchema,
  MemoryRecordSchema,
  OllamaProviderStatusResponseSchema,
  TaskProposalSchema,
  UpdateMemoryRequestSchema,
  type HealthResponse,
  type OllamaProviderStatusResponse,
} from "@arc/contracts";
import { z } from "zod";

export const ArcStatusSnapshotSchema = z.object({
  backend: HealthResponseSchema.nullable(),
  backendUrl: z.string().url(),
  checkedAt: z.string().datetime(),
  error: z.string().min(1).optional(),
  ollama: OllamaProviderStatusResponseSchema.nullable(),
});

export type ArcStatusSnapshot = z.infer<typeof ArcStatusSnapshotSchema>;

export interface BackendStatusSnapshot {
  readonly backend: HealthResponse | null;
  readonly backendUrl: string;
  readonly checkedAt: string;
  readonly error?: string;
  readonly ollama: OllamaProviderStatusResponse | null;
}

const ChatIdentifierSchema = z.string().min(1).max(160);

export const ChatConnectionStatusSchema = z.enum(["idle", "connecting", "connected", "reconnecting", "offline"]);

export const ChatSessionMessageRoleSchema = z.enum(["user", "assistant"]);

export const ChatSessionMessageStatusSchema = z.enum(["pending", "streaming", "completed", "cancelled", "failed"]);

export const ChatClientErrorSchema = z.object({
  code: z.string().min(1).max(160),
  message: z.string().min(1).max(4_000),
  retryable: z.boolean(),
});

export const ChatSessionMessageSchema = z.object({
  content: z.string().max(200_000),
  createdAt: z.string().datetime(),
  error: ChatClientErrorSchema.optional(),
  id: ChatIdentifierSchema,
  role: ChatSessionMessageRoleSchema,
  status: ChatSessionMessageStatusSchema,
});

export const ActiveChatGenerationSchema = z.object({
  assistantMessageId: ChatIdentifierSchema,
  requestId: ChatIdentifierSchema,
});

export const ChatSessionSnapshotSchema = z.object({
  activeGeneration: ActiveChatGenerationSchema.nullable(),
  connectionStatus: ChatConnectionStatusSchema,
  messages: z.array(ChatSessionMessageSchema).max(200),
  sessionId: ChatIdentifierSchema,
});

export const ConversationListSnapshotSchema = z.object({
  activeSessionId: ConversationIdSchema.nullable(),
  sessions: z.array(ConversationSessionSummarySchema).max(100),
});

export type ChatConnectionStatus = z.infer<typeof ChatConnectionStatusSchema>;
export type ChatClientError = z.infer<typeof ChatClientErrorSchema>;
export type ChatSessionMessage = z.infer<typeof ChatSessionMessageSchema>;
export type ActiveChatGeneration = z.infer<typeof ActiveChatGenerationSchema>;
export type ChatSessionSnapshot = z.infer<typeof ChatSessionSnapshotSchema>;
export type ConversationListSnapshot = z.infer<typeof ConversationListSnapshotSchema>;
export type EditProposal = z.infer<typeof EditProposalSchema>;
export type MemoryDraft = z.infer<typeof MemoryDraftSchema>;
export type MemoryProposal = z.infer<typeof MemoryProposalSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type TaskProposal = z.infer<typeof TaskProposalSchema>;

const ChatSubmitCommandSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  type: z.literal("chat:submit"),
});

const ExternalHttpUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  });

export const WebviewToExtensionMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("webview:ready") }),
  z.object({ type: z.literal("status:refresh") }),
  z.object({ type: z.literal("chat:reconnect") }),
  ChatSubmitCommandSchema,
  z.object({ type: z.literal("chat:cancel") }),
  z.object({ type: z.literal("conversation:create") }),
  z.object({
    sessionId: ConversationIdSchema,
    type: z.literal("conversation:select"),
  }),
  z.object({
    sessionId: ConversationIdSchema,
    title: z.string().trim().min(1).max(120),
    type: z.literal("conversation:rename"),
  }),
  z.object({
    sessionId: ConversationIdSchema,
    type: z.literal("conversation:delete"),
  }),
  z.object({
    content: z.string().min(1).max(200_000),
    type: z.literal("code:copy"),
  }),
  z.object({ operationId: z.string().uuid(), proposalId: z.string().uuid(), type: z.literal("edits:preview") }),
  z.object({
    operationIds: z.array(z.string().uuid()).min(1).max(20),
    proposalId: z.string().uuid(),
    type: z.literal("edits:approve"),
  }),
  z.object({ proposalId: z.string().uuid(), type: z.literal("edits:reject") }),
  z.object({ proposalId: z.string().uuid(), type: z.literal("edits:undo") }),
  z.object({ proposalId: z.string().uuid(), type: z.literal("tasks:approve") }),
  z.object({ proposalId: z.string().uuid(), type: z.literal("tasks:reject") }),
  z.object({ proposalId: z.string().uuid(), type: z.literal("tasks:cancel") }),
  z.object({ proposalId: z.string().uuid(), type: z.literal("tasks:show-output") }),
  z.object({ type: z.literal("memories:refresh") }),
  z.object({ input: MemoryDraftSchema, type: z.literal("memories:create") }),
  z.object({ memoryId: MemoryIdSchema, type: z.literal("memories:forget") }),
  z.object({ memoryId: MemoryIdSchema, input: UpdateMemoryRequestSchema, type: z.literal("memories:update") }),
  z.object({ proposalId: MemoryIdSchema, type: z.literal("memories:approve") }),
  z.object({ proposalId: MemoryIdSchema, type: z.literal("memories:reject") }),
  z.object({ type: z.literal("memories:export") }),
  z.object({ records: z.array(MemoryDraftSchema).min(1).max(200), type: z.literal("memories:import") }),
  z.object({
    type: z.literal("link:open"),
    url: ExternalHttpUrlSchema,
  }),
]);

export type WebviewToExtensionMessage = z.infer<typeof WebviewToExtensionMessageSchema>;

export const ExtensionToWebviewMessageSchema = z.discriminatedUnion("type", [
  z.object({
    snapshot: ArcStatusSnapshotSchema,
    type: z.literal("status:update"),
  }),
  z.object({
    session: ChatSessionSnapshotSchema,
    type: z.literal("chat:hydrated"),
  }),
  z.object({
    snapshot: ConversationListSnapshotSchema,
    type: z.literal("conversations:updated"),
  }),
  z.object({
    message: z.string().min(1).max(4_000),
    type: z.literal("conversations:error"),
  }),
  z.object({
    session: ChatSessionSnapshotSchema,
    type: z.literal("chat:submitted"),
  }),
  z.object({
    requestId: ChatIdentifierSchema,
    type: z.literal("chat:generation-started"),
  }),
  z.object({
    content: z.string().min(1).max(16_000),
    requestId: ChatIdentifierSchema,
    type: z.literal("chat:generation-delta"),
  }),
  z.object({
    requestId: ChatIdentifierSchema,
    type: z.literal("chat:generation-completed"),
  }),
  z.object({
    requestId: ChatIdentifierSchema,
    type: z.literal("chat:generation-cancelled"),
  }),
  z.object({
    error: ChatClientErrorSchema,
    requestId: ChatIdentifierSchema,
    type: z.literal("chat:generation-failed"),
  }),
  z.object({
    status: ChatConnectionStatusSchema,
    type: z.literal("chat:connection-updated"),
  }),
  z.object({ proposal: EditProposalSchema, type: z.literal("edits:proposed") }),
  z.object({ proposal: EditProposalSchema, type: z.literal("edits:updated") }),
  z.object({ message: z.string().min(1).max(4_000), type: z.literal("edits:error") }),
  z.object({ proposal: TaskProposalSchema, type: z.literal("tasks:updated") }),
  z.object({ message: z.string().min(1).max(4_000), type: z.literal("tasks:error") }),
  z.object({ records: z.array(MemoryRecordSchema).max(200), type: z.literal("memories:updated") }),
  z.object({ proposal: MemoryProposalSchema, type: z.literal("memories:proposal") }),
  z.object({ value: MemoryExportSchema, type: z.literal("memories:exported") }),
  z.object({ message: z.string().min(1).max(4_000), type: z.literal("memories:error") }),
]);

export type ExtensionToWebviewMessage = z.infer<typeof ExtensionToWebviewMessageSchema>;

export function parseWebviewToExtensionMessage(value: unknown): WebviewToExtensionMessage | null {
  const parsed = WebviewToExtensionMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseExtensionToWebviewMessage(value: unknown): ExtensionToWebviewMessage | null {
  const parsed = ExtensionToWebviewMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
