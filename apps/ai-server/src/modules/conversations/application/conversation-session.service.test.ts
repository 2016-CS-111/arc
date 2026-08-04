import type {
  ConversationMessage,
  ConversationSession,
  ConversationSessionSnapshot,
  ConversationSessionSummary,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ConversationRepository } from "./conversation.repository.js";
import { ConversationSessionService } from "./conversation-session.service.js";

const session: ConversationSession = {
  id: "0d2e5770-f08e-48d5-871b-36bf734f535c",
  title: "New conversation",
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
};

const message: ConversationMessage = {
  id: "e97367c1-c595-4aa2-b8d9-a852cbbd69a4",
  sessionId: session.id,
  requestId: "3b7acbf0-c8f4-4f27-a537-0b6ac906531a",
  ordinal: 1,
  role: "user",
  status: "completed",
  content: "Hello",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
};

function createRepository(): {
  readonly repository: ConversationRepository;
  readonly createSession: ReturnType<typeof vi.fn>;
  readonly ensureSession: ReturnType<typeof vi.fn>;
  readonly listSessions: ReturnType<typeof vi.fn>;
  readonly getSession: ReturnType<typeof vi.fn>;
  readonly renameSession: ReturnType<typeof vi.fn>;
  readonly deleteSession: ReturnType<typeof vi.fn>;
} {
  const createSession = vi.fn(() => Promise.resolve(session));
  const ensureSession = vi.fn(() => Promise.resolve(session));
  const listSessions = vi.fn(() =>
    Promise.resolve([{ ...session, messageCount: 1 }] satisfies ConversationSessionSummary[]),
  );
  const getSession = vi.fn(() =>
    Promise.resolve({ ...session, messages: [message] } satisfies ConversationSessionSnapshot),
  );
  const renameSession = vi.fn(() => Promise.resolve(session));
  const deleteSession = vi.fn(() => Promise.resolve(true));

  return {
    repository: {
      createSession,
      ensureSession,
      listSessions,
      getSession,
      renameSession,
      deleteSession,
      createPendingTurn: vi.fn(),
      updateAssistantMessage: vi.fn(),
      recoverInterruptedAssistantMessages: vi.fn(),
    },
    createSession,
    ensureSession,
    listSessions,
    getSession,
    renameSession,
    deleteSession,
  };
}

describe("ConversationSessionService", () => {
  it("normalizes titles and bounds a requested list size before delegating", async () => {
    const { repository, createSession, listSessions, renameSession } = createRepository();
    const service = new ConversationSessionService(repository);

    await service.create("  Build plan  ");
    await service.list(1_000);
    await service.rename(session.id, "  Renamed  ");

    expect(createSession).toHaveBeenCalledWith({ title: "Build plan" });
    expect(listSessions).toHaveBeenCalledWith({ limit: 100 });
    expect(renameSession).toHaveBeenCalledWith(session.id, "Renamed");
  });

  it("delegates session loading and deletion without changing identifiers", async () => {
    const { repository, ensureSession, getSession, deleteSession } = createRepository();
    const service = new ConversationSessionService(repository);

    await expect(service.load(session.id)).resolves.toEqual({ ...session, messages: [message] });
    await expect(service.ensure(session.id)).resolves.toEqual(session);
    await expect(service.delete(session.id)).resolves.toBe(true);
    expect(getSession).toHaveBeenCalledWith(session.id);
    expect(ensureSession).toHaveBeenCalledWith(session.id);
    expect(deleteSession).toHaveBeenCalledWith(session.id);
  });
});
