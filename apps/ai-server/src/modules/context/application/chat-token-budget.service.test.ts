import type { ChatModelMessage } from "../../inference/domain/chat-model.types.js";
import { loadConfig } from "../../../config/env.js";
import { describe, expect, it } from "vitest";

import { ChatTokenBudgetService } from "./chat-token-budget.service.js";

const messages: readonly ChatModelMessage[] = [
  { content: "first question", role: "user" },
  { content: "first answer", role: "assistant" },
  { content: "latest question", role: "user" },
  { content: "latest answer", role: "assistant" },
];

describe("ChatTokenBudgetService", () => {
  it("estimates text and reserves configured output capacity", () => {
    const service = new ChatTokenBudgetService(loadConfig({}));

    expect(service.estimateText("12345678")).toBe(2);
    expect(service.inputTokenLimit).toBe(6_144);
  });

  it("keeps the newest complete turns in chronological order", () => {
    const service = new ChatTokenBudgetService(loadConfig({}));
    const latestTurnTokens = service.estimateMessages(messages.slice(-2));

    expect(service.selectCompleteTurns(messages, latestTurnTokens)).toEqual({
      estimatedTokens: latestTurnTokens,
      messages: messages.slice(-2),
    });
    expect(service.selectCompleteTurns(messages, 10_000).messages).toEqual(messages);
  });

  it("does not include dangling historical messages", () => {
    const service = new ChatTokenBudgetService(loadConfig({}));

    expect(
      service.selectCompleteTurns([{ content: "orphaned question", role: "user" }, ...messages], 10_000).messages,
    ).toEqual(messages);
  });
});
