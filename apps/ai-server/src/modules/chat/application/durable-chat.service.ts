import type { ChatError, ChatSendCommand, ConversationMessage, ConversationSessionSnapshot } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";

import { ConversationGenerationStateService } from "../../conversations/application/conversation-generation-state.service.js";
import { ConversationSessionService } from "../../conversations/application/conversation-session.service.js";
import { ARC_LOGGER } from "../../logger/logger.constants.js";
import type { ChatModelMessage } from "../../inference/domain/chat-model.types.js";

export type DurableChatPreparation =
  | {
      readonly type: "new";
      readonly assistantMessage: ConversationMessage;
      readonly modelMessages: readonly ChatModelMessage[];
    }
  | {
      readonly type: "existing";
      readonly assistantMessage: ConversationMessage;
    };

@Injectable()
export class DurableChatService implements OnApplicationBootstrap {
  public constructor(
    @Inject(ConversationSessionService)
    private readonly conversationSessionService: ConversationSessionService,
    @Inject(ConversationGenerationStateService)
    private readonly conversationGenerationStateService: ConversationGenerationStateService,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const recoveredCount = await this.conversationGenerationStateService.recoverInterrupted();
      if (recoveredCount > 0) {
        this.logger.warn("Recovered interrupted Arc generations", { recoveredCount });
      }
    } catch (error) {
      this.logger.warn("Could not recover interrupted Arc generations", {
        error: getErrorMessage(error),
      });
    }
  }

  public async prepare(command: ChatSendCommand): Promise<DurableChatPreparation> {
    await this.conversationSessionService.ensure(command.sessionId);
    const turn = await this.conversationGenerationStateService.start({
      sessionId: command.sessionId,
      requestId: command.requestId,
      userContent: command.content,
    });
    if (turn === undefined) {
      throw new Error("Arc conversation session could not be created.");
    }

    if (!turn.created) {
      return {
        type: "existing",
        assistantMessage: turn.assistantMessage,
      };
    }

    const session = await this.conversationSessionService.load(command.sessionId);
    if (session === undefined) {
      throw new Error("Arc conversation session could not be loaded after creating a turn.");
    }

    return {
      type: "new",
      assistantMessage: turn.assistantMessage,
      modelMessages: this.buildModelMessages(session),
    };
  }

  public stream(sessionId: string, requestId: string, content: string): Promise<ConversationMessage | undefined> {
    return this.conversationGenerationStateService.stream(sessionId, requestId, content);
  }

  public complete(sessionId: string, requestId: string, content: string): Promise<ConversationMessage | undefined> {
    return this.conversationGenerationStateService.complete(sessionId, requestId, content);
  }

  public cancel(sessionId: string, requestId: string, content: string): Promise<ConversationMessage | undefined> {
    return this.conversationGenerationStateService.cancel(sessionId, requestId, content);
  }

  public fail(
    sessionId: string,
    requestId: string,
    content: string,
    error: ChatError,
  ): Promise<ConversationMessage | undefined> {
    return this.conversationGenerationStateService.fail(sessionId, requestId, content, error);
  }

  private buildModelMessages(session: ConversationSessionSnapshot): readonly ChatModelMessage[] {
    const messages = session.messages
      .filter((message) => this.isModelContextMessage(message))
      .map((message) => ({ content: message.content, role: message.role }))
      .slice(-40);

    if (messages.length === 0 || messages.at(-1)?.role !== "user") {
      throw new Error("Arc conversation does not contain a current user message.");
    }

    return messages;
  }

  private isModelContextMessage(message: ConversationMessage): boolean {
    return message.content.length > 0 && message.status === "completed";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
