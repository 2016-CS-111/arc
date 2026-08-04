import type { ChatError, ConversationMessage } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { CONVERSATION_REPOSITORY } from "../conversations.constants.js";
import type { ConversationTurn, CreateConversationTurnInput } from "../domain/conversation.types.js";
import type { ConversationRepository } from "./conversation.repository.js";

@Injectable()
export class ConversationGenerationStateService {
  public constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: ConversationRepository,
  ) {}

  public start(input: CreateConversationTurnInput): Promise<ConversationTurn | undefined> {
    return this.conversationRepository.createPendingTurn(input);
  }

  public stream(sessionId: string, requestId: string, content: string): Promise<ConversationMessage | undefined> {
    return this.conversationRepository.updateAssistantMessage({
      content,
      requestId,
      sessionId,
      status: "streaming",
    });
  }

  public complete(sessionId: string, requestId: string, content: string): Promise<ConversationMessage | undefined> {
    return this.conversationRepository.updateAssistantMessage({
      content,
      requestId,
      sessionId,
      status: "completed",
    });
  }

  public cancel(sessionId: string, requestId: string, content: string): Promise<ConversationMessage | undefined> {
    return this.conversationRepository.updateAssistantMessage({
      content,
      requestId,
      sessionId,
      status: "cancelled",
    });
  }

  public fail(
    sessionId: string,
    requestId: string,
    content: string,
    error: ChatError,
  ): Promise<ConversationMessage | undefined> {
    return this.conversationRepository.updateAssistantMessage({
      content,
      error,
      requestId,
      sessionId,
      status: "failed",
    });
  }

  public recoverInterrupted(): Promise<number> {
    return this.conversationRepository.recoverInterruptedAssistantMessages({
      code: "generation_failed",
      message: "Generation interrupted by an Arc backend restart.",
      retryable: true,
    });
  }
}
