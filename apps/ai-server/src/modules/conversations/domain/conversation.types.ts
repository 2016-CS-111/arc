import type { ChatError, ConversationMessage, ConversationMessageStatus, ConversationSession } from "@arc/contracts";

export interface ConversationListOptions {
  readonly limit?: number;
}

export interface CreateConversationSessionInput {
  readonly title?: string;
}

export interface CreateConversationTurnInput {
  readonly sessionId: string;
  readonly requestId: string;
  readonly userContent: string;
}

export interface ConversationTurn {
  readonly created: boolean;
  readonly session: ConversationSession;
  readonly userMessage: ConversationMessage;
  readonly assistantMessage: ConversationMessage;
}

export type AssistantMessageUpdateStatus = Extract<
  ConversationMessageStatus,
  "streaming" | "completed" | "cancelled" | "failed"
>;

export interface UpdateAssistantMessageInput {
  readonly sessionId: string;
  readonly requestId: string;
  readonly content: string;
  readonly status: AssistantMessageUpdateStatus;
  readonly error?: ChatError;
}
