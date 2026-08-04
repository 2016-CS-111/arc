import type { ConversationMessage, ConversationSession } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ConversationRepository } from "./conversation.repository.js";
import { ConversationGenerationStateService } from "./conversation-generation-state.service.js";
import type { UpdateAssistantMessageInput } from "../domain/conversation.types.js";

const session: ConversationSession = {
  id: "0d2e5770-f08e-48d5-871b-36bf734f535c",
  title: "New conversation",
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
};

const assistantMessage: ConversationMessage = {
  id: "1d089847-4de9-41c0-af93-3d7411a6068e",
  sessionId: session.id,
  requestId: "3b7acbf0-c8f4-4f27-a537-0b6ac906531a",
  ordinal: 2,
  role: "assistant",
  status: "pending",
  content: "",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
};

function createRepository(): {
  readonly repository: ConversationRepository;
  readonly createPendingTurn: ReturnType<typeof vi.fn>;
  readonly updateAssistantMessage: ReturnType<typeof vi.fn>;
  readonly recoverInterruptedAssistantMessages: ReturnType<typeof vi.fn>;
} {
  const createPendingTurn = vi.fn(() =>
    Promise.resolve({
      created: true,
      session,
      userMessage: {
        ...assistantMessage,
        id: "e97367c1-c595-4aa2-b8d9-a852cbbd69a4",
        ordinal: 1,
        role: "user",
        status: "completed",
        content: "Hello",
      },
      assistantMessage,
    }),
  );
  const updateAssistantMessage = vi.fn((input: UpdateAssistantMessageInput) =>
    Promise.resolve({ ...assistantMessage, ...input }),
  );
  const recoverInterruptedAssistantMessages = vi.fn(() => Promise.resolve(2));

  return {
    repository: {
      createSession: vi.fn(),
      ensureSession: vi.fn(),
      listSessions: vi.fn(),
      getSession: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
      createPendingTurn,
      updateAssistantMessage,
      recoverInterruptedAssistantMessages,
    },
    createPendingTurn,
    updateAssistantMessage,
    recoverInterruptedAssistantMessages,
  };
}

describe("ConversationGenerationStateService", () => {
  it("persists each generation transition under the same session and request", async () => {
    const { repository, createPendingTurn, updateAssistantMessage } = createRepository();
    const service = new ConversationGenerationStateService(repository);
    const requestId = assistantMessage.requestId;

    await service.start({ sessionId: session.id, requestId, userContent: "Hello" });
    await service.stream(session.id, requestId, "Hel");
    await service.complete(session.id, requestId, "Hello back");
    await service.cancel(session.id, requestId, "Partial");
    await service.fail(session.id, requestId, "Partial", {
      code: "provider_unavailable",
      message: "Ollama is unavailable.",
      retryable: true,
    });

    expect(createPendingTurn).toHaveBeenCalledWith({
      sessionId: session.id,
      requestId,
      userContent: "Hello",
    });
    expect(updateAssistantMessage).toHaveBeenNthCalledWith(1, {
      sessionId: session.id,
      requestId,
      content: "Hel",
      status: "streaming",
    });
    expect(updateAssistantMessage).toHaveBeenNthCalledWith(2, {
      sessionId: session.id,
      requestId,
      content: "Hello back",
      status: "completed",
    });
    expect(updateAssistantMessage).toHaveBeenNthCalledWith(3, {
      sessionId: session.id,
      requestId,
      content: "Partial",
      status: "cancelled",
    });
    expect(updateAssistantMessage).toHaveBeenNthCalledWith(4, {
      sessionId: session.id,
      requestId,
      content: "Partial",
      status: "failed",
      error: {
        code: "provider_unavailable",
        message: "Ollama is unavailable.",
        retryable: true,
      },
    });
  });

  it("marks any interrupted assistant messages as retryable failures", async () => {
    const { repository, recoverInterruptedAssistantMessages } = createRepository();
    const service = new ConversationGenerationStateService(repository);

    await expect(service.recoverInterrupted()).resolves.toBe(2);
    expect(recoverInterruptedAssistantMessages).toHaveBeenCalledWith({
      code: "generation_failed",
      message: "Generation interrupted by an Arc backend restart.",
      retryable: true,
    });
  });
});
