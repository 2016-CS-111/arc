import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import type { ChatModelMessage } from "../../inference/domain/chat-model.types.js";

export interface BudgetedChatHistory {
  readonly messages: readonly ChatModelMessage[];
  readonly estimatedTokens: number;
}

@Injectable()
export class ChatTokenBudgetService {
  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  public get inputTokenLimit(): number {
    return this.config.chatContext.contextWindowTokens - this.config.chatContext.outputReserveTokens;
  }

  public estimateText(content: string): number {
    return Math.ceil(content.length / 4);
  }

  public estimateMessage(message: ChatModelMessage): number {
    return this.estimateText(message.content) + 4;
  }

  public estimateMessages(messages: readonly ChatModelMessage[]): number {
    return messages.reduce((total, message) => total + this.estimateMessage(message), 0);
  }

  public selectCompleteTurns(messages: readonly ChatModelMessage[], tokenLimit: number): BudgetedChatHistory {
    const selected: ChatModelMessage[][] = [];
    let estimatedTokens = 0;
    let cursor = messages.length;

    while (cursor >= 2) {
      const assistant = messages[cursor - 1];
      const user = messages[cursor - 2];

      if (assistant?.role !== "assistant" || user?.role !== "user") {
        cursor -= 1;
        continue;
      }

      const turn = [user, assistant];
      const turnTokens = this.estimateMessages(turn);
      if (estimatedTokens + turnTokens > tokenLimit) {
        break;
      }

      selected.unshift(turn);
      estimatedTokens += turnTokens;
      cursor -= 2;
    }

    return {
      estimatedTokens,
      messages: selected.flat(),
    };
  }
}
