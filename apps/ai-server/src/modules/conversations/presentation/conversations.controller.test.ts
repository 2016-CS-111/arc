import type { ConversationSession, ConversationSessionSnapshot, ConversationSessionSummary } from "@arc/contracts";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ConversationSessionService } from "../application/conversation-session.service.js";
import { ConversationsController } from "./conversations.controller.js";

const session: ConversationSession = {
  id: "0d2e5770-f08e-48d5-871b-36bf734f535c",
  title: "New chat",
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
};

function createController(): {
  readonly controller: ConversationsController;
  readonly create: ReturnType<typeof vi.fn>;
  readonly list: ReturnType<typeof vi.fn>;
  readonly load: ReturnType<typeof vi.fn>;
  readonly rename: ReturnType<typeof vi.fn>;
  readonly deleteSession: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(() => Promise.resolve(session));
  const list = vi.fn(() => Promise.resolve([{ ...session, messageCount: 0 }] satisfies ConversationSessionSummary[]));
  const load = vi.fn(() => Promise.resolve({ ...session, messages: [] } satisfies ConversationSessionSnapshot));
  const rename = vi.fn(() => Promise.resolve({ ...session, title: "Renamed" }));
  const deleteSession = vi.fn(() => Promise.resolve(true));

  return {
    controller: new ConversationsController({
      create,
      list,
      load,
      rename,
      delete: deleteSession,
    } as unknown as ConversationSessionService),
    create,
    list,
    load,
    rename,
    deleteSession,
  };
}

describe("ConversationsController", () => {
  it("validates REST inputs before delegating to the session service", async () => {
    const { controller, create, list, rename, deleteSession } = createController();

    await controller.create({ title: "  Architecture  " });
    await controller.list({ limit: "25" });
    await controller.rename(session.id, { title: "Renamed" });
    await controller.delete(session.id);

    expect(create).toHaveBeenCalledWith("Architecture");
    expect(list).toHaveBeenCalledWith(25);
    expect(rename).toHaveBeenCalledWith(session.id, "Renamed");
    expect(deleteSession).toHaveBeenCalledWith(session.id);
  });

  it("returns clear HTTP errors for invalid or missing sessions", async () => {
    const { controller, load } = createController();
    load.mockReturnValue(Promise.resolve(undefined));

    await expect(controller.get("not-a-uuid")).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.get(session.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
