import {
  ConversationTitleSchema,
  type ConversationSession,
  type ConversationSessionSnapshot,
  type ConversationSessionSummary,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { CONVERSATION_REPOSITORY } from "../conversations.constants.js";
import type { ConversationRepository } from "./conversation.repository.js";

@Injectable()
export class ConversationSessionService {
  public constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: ConversationRepository,
  ) {}

  public create(title?: string): Promise<ConversationSession> {
    return this.conversationRepository.createSession({
      ...(title === undefined ? {} : { title: ConversationTitleSchema.parse(title) }),
    });
  }

  public list(limit?: number): Promise<ConversationSessionSummary[]> {
    return this.conversationRepository.listSessions({
      ...(limit === undefined ? {} : { limit: Math.min(Math.max(limit, 1), 100) }),
    });
  }

  public load(sessionId: string): Promise<ConversationSessionSnapshot | undefined> {
    return this.conversationRepository.getSession(sessionId);
  }

  public rename(sessionId: string, title: string): Promise<ConversationSession | undefined> {
    return this.conversationRepository.renameSession(sessionId, ConversationTitleSchema.parse(title));
  }

  public delete(sessionId: string): Promise<boolean> {
    return this.conversationRepository.deleteSession(sessionId);
  }
}
