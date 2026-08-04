import type { ConversationMessage, ConversationSession, ConversationSessionSnapshot } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import type { ConversationGenerationStateService } from "../../conversations/application/conversation-generation-state.service.js";
import type { ConversationSessionService } from "../../conversations/application/conversation-session.service.js";
import { DurableChatService } from "./durable-chat.service.js";

const session: ConversationSession = {
  id: "0d2e5770-f08e-48d5-871b-36bf734f535c",
  title: "Architecture notes",
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
};

const userMessage: ConversationMessage = {
  id: "e97367c1-c595-4aa2-b8d9-a852cbbd69a4",
  sessionId: session.id,
  requestId: "request-1",
  ordinal: 1,
  role: "user",
  status: "completed",
  content: "What is a repository?",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
};

const completedAssistantMessage: ConversationMessage = {
  id: "1d089847-4de9-41c0-af93-3d7411a6068e",
  sessionId: session.id,
  requestId: "request-1",
  ordinal: 2,
  role: "assistant",
  status: "completed",
  content: "A boundary around data access.",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
};

const currentUserMessage: ConversationMessage = {
  id: "7a8637d4-6669-488a-97dc-9d0db6b94853",
  sessionId: session.id,
  requestId: "request-2",
  ordinal: 3,
  role: "user",
  status: "completed",
  content: "How does it help Arc?",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
};

const pendingAssistantMessage: ConversationMessage = {
  id: "51079c15-a4c7-4e93-af00-46767d2d715b",
  sessionId: session.id,
  requestId: "request-2",
  ordinal: 4,
  role: "assistant",
  status: "pending",
  content: "",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
};

const snapshot: ConversationSessionSnapshot = {
  ...session,
  messages: [userMessage, completedAssistantMessage, currentUserMessage, pendingAssistantMessage],
};

function createLogger(): { readonly logger: Logger; readonly warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();

  return {
    logger: {
      debug: (): void => undefined,
      error: (): void => undefined,
      info: (): void => undefined,
      warn,
    },
    warn,
  };
}

describe("DurableChatService", () => {
  it("loads completed persisted history and excludes the pending assistant placeholder", async () => {
    const ensure = vi.fn(() => Promise.resolve(session));
    const load = vi.fn(() => Promise.resolve(snapshot));
    const start = vi.fn(() =>
      Promise.resolve({
        created: true,
        session,
        userMessage: currentUserMessage,
        assistantMessage: pendingAssistantMessage,
      }),
    );
    const { logger } = createLogger();
    const service = new DurableChatService(
      { ensure, load } as unknown as ConversationSessionService,
      { start } as unknown as ConversationGenerationStateService,
      logger,
    );

    const preparation = await service.prepare({
      requestId: "request-2",
      sessionId: session.id,
      content: "How does it help Arc?",
    });

    expect(ensure).toHaveBeenCalledWith(session.id);
    expect(start).toHaveBeenCalledWith({
      sessionId: session.id,
      requestId: "request-2",
      userContent: "How does it help Arc?",
    });
    expect(preparation).toEqual({
      type: "new",
      assistantMessage: pendingAssistantMessage,
      modelMessages: [
        { role: "user", content: "What is a repository?" },
        { role: "assistant", content: "A boundary around data access." },
        { role: "user", content: "How does it help Arc?" },
      ],
    });
  });

  it("returns an existing turn without invoking the model-context loader", async () => {
    const ensure = vi.fn(() => Promise.resolve(session));
    const load = vi.fn();
    const start = vi.fn(() =>
      Promise.resolve({
        created: false,
        session,
        userMessage: currentUserMessage,
        assistantMessage: completedAssistantMessage,
      }),
    );
    const { logger } = createLogger();
    const service = new DurableChatService(
      { ensure, load } as unknown as ConversationSessionService,
      { start } as unknown as ConversationGenerationStateService,
      logger,
    );

    await expect(
      service.prepare({ requestId: "request-1", sessionId: session.id, content: "Duplicate" }),
    ).resolves.toEqual({
      type: "existing",
      assistantMessage: completedAssistantMessage,
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("recovers interrupted generations without preventing backend startup", async () => {
    const recoverInterrupted = vi.fn(() => Promise.resolve(2));
    const { logger, warn } = createLogger();
    const service = new DurableChatService(
      {} as ConversationSessionService,
      { recoverInterrupted } as unknown as ConversationGenerationStateService,
      logger,
    );

    await service.onApplicationBootstrap();

    expect(recoverInterrupted).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Recovered interrupted Arc generations", { recoveredCount: 2 });
  });

  it("does not throw when recovery storage is unavailable", async () => {
    const { logger, warn } = createLogger();
    const service = new DurableChatService(
      {} as ConversationSessionService,
      {
        recoverInterrupted: (): Promise<number> => Promise.reject(new Error("Database unavailable")),
      } as unknown as ConversationGenerationStateService,
      logger,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Could not recover interrupted Arc generations", {
      error: "Database unavailable",
    });
  });
});
