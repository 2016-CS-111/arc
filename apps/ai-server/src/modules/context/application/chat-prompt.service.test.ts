import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type { ChatModelMessage } from "../../inference/domain/chat-model.types.js";
import { ChatContextWindowExceededError } from "../domain/chat-context.errors.js";
import type { ProjectChatContextService } from "./project-chat-context.service.js";
import type { MemoryPromptContextService } from "./memory-prompt-context.service.js";
import { ChatPromptService } from "./chat-prompt.service.js";
import { ChatTokenBudgetService } from "./chat-token-budget.service.js";

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};
const messages: readonly ChatModelMessage[] = [
  { content: "Earlier question", role: "user" },
  { content: "Earlier answer", role: "assistant" },
  { content: "Explain the answer module", role: "user" },
];

function createProjectContextService() {
  return {
    select: vi.fn(() =>
      Promise.resolve({
        candidateCount: 2,
        content: "ARC PROJECT CONTEXT\n\nSOURCE",
        estimatedTokens: 16,
        omittedCount: 1,
        reason: "prompt_budget" as const,
        selectedCount: 1,
      }),
    ),
  };
}

function createMemoryContextService() {
  return {
    select: vi.fn(() =>
      Promise.resolve({
        content: "ARC USER-APPROVED MEMORY\n- [project:convention] Use Sequelize.",
        estimatedTokens: 16,
        omittedCount: 0,
        selectedCount: 1,
      }),
    ),
  };
}

describe("ChatPromptService", () => {
  it("assembles system, project, complete history, and current user messages", async () => {
    const config = loadConfig({});
    const projectContextService = createProjectContextService();
    const service = new ChatPromptService(
      config,
      new ChatTokenBudgetService(config),
      projectContextService as unknown as ProjectChatContextService,
      logger,
    );

    const result = await service.build(
      {
        messages,
        projectId: "00000000-0000-4000-8000-000000000001",
        requestId: "request-1",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      new AbortController().signal,
    );

    expect(result.messages.map((message) => message.role)).toEqual(["system", "user", "user", "assistant", "user"]);
    expect(result.messages.at(1)?.content).toContain("ARC PROJECT CONTEXT");
    expect(result.messages.at(-1)?.content).toBe("Explain the answer module");
    expect(result.estimatedInputTokens).toBeLessThanOrEqual(6_144);
  });

  it("keeps context-free chat available when no project is registered", async () => {
    const config = loadConfig({});
    const projectContextService = createProjectContextService();
    const service = new ChatPromptService(
      config,
      new ChatTokenBudgetService(config),
      projectContextService as unknown as ProjectChatContextService,
      logger,
    );

    const result = await service.build(
      {
        messages,
        requestId: "request-1",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      new AbortController().signal,
    );

    expect(projectContextService.select).not.toHaveBeenCalled();
    expect(result.messages.some((message) => message.content.includes("ARC PROJECT CONTEXT"))).toBe(false);
  });

  it("attaches user-approved memory before project context", async () => {
    const config = loadConfig({});
    const memoryContextService = createMemoryContextService();
    const service = new ChatPromptService(
      config,
      new ChatTokenBudgetService(config),
      createProjectContextService() as unknown as ProjectChatContextService,
      logger,
      memoryContextService as unknown as MemoryPromptContextService,
    );

    const result = await service.build(
      {
        messages,
        projectId: "00000000-0000-4000-8000-000000000001",
        requestId: "request-1",
        sessionId: "00000000-0000-4000-8000-000000000002",
      },
      new AbortController().signal,
    );

    expect(result.messages.at(1)?.content).toContain("ARC USER-APPROVED MEMORY");
    expect(memoryContextService.select).toHaveBeenCalledOnce();
    expect(result.estimatedMemoryTokens).toBe(16);
  });

  it("rejects required prompt content larger than the configured input budget", async () => {
    const config = loadConfig({
      ARC_CHAT_CONTEXT_WINDOW_TOKENS: "2048",
      ARC_CHAT_HISTORY_TOKENS: "512",
      ARC_CHAT_OUTPUT_RESERVE_TOKENS: "512",
      ARC_CHAT_PROJECT_CONTEXT_TOKENS: "512",
    });
    const service = new ChatPromptService(
      config,
      new ChatTokenBudgetService(config),
      createProjectContextService() as unknown as ProjectChatContextService,
      logger,
    );

    await expect(
      service.build(
        {
          messages: [{ content: "x".repeat(8_000), role: "user" }],
          requestId: "request-1",
          sessionId: "00000000-0000-4000-8000-000000000002",
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ChatContextWindowExceededError);
  });
});
