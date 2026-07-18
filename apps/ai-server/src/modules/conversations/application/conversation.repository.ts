import type {
  ChatError,
  ConversationMessage,
  ConversationSession,
  ConversationSessionSnapshot,
  ConversationSessionSummary,
} from "@arc/contracts";

import type {
  ConversationListOptions,
  ConversationTurn,
  CreateConversationSessionInput,
  CreateConversationTurnInput,
  UpdateAssistantMessageInput,
} from "../domain/conversation.types.js";

export interface ConversationRepository {
  createSession(input: CreateConversationSessionInput): Promise<ConversationSession>;
  listSessions(options?: ConversationListOptions): Promise<ConversationSessionSummary[]>;
  getSession(sessionId: string): Promise<ConversationSessionSnapshot | undefined>;
  renameSession(sessionId: string, title: string): Promise<ConversationSession | undefined>;
  deleteSession(sessionId: string): Promise<boolean>;
  createPendingTurn(input: CreateConversationTurnInput): Promise<ConversationTurn | undefined>;
  updateAssistantMessage(input: UpdateAssistantMessageInput): Promise<ConversationMessage | undefined>;
  recoverInterruptedAssistantMessages(error: ChatError): Promise<number>;
}
