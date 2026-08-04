import type { MemoryRecord } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { MemoryService } from "./memory.service.js";
import { MemoryProposalService } from "./memory-proposal.service.js";

describe("MemoryProposalService", () => {
  it("stores an assistant suggestion only after explicit approval", async () => {
    const create = vi.fn(() => Promise.resolve(memory));
    const service = new MemoryProposalService({ create } as unknown as MemoryService);
    const proposal = service.propose({
      projectId: "c7d0da58-9f18-4d86-89d7-53c372d95472",
      request: {
        content: "Use Sequelize models for Arc persistence.",
        kind: "convention",
        scope: "project",
      },
      requestId: "request-1",
      sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
    });

    expect(create).not.toHaveBeenCalled();
    await expect(service.approve(proposal.id)).resolves.toEqual(memory);
    expect(create).toHaveBeenCalledWith(proposal.candidate, "assistant");
    expect(service.get(proposal.id)).toMatchObject({ memoryId: memory.id, status: "approved" });
  });
});

const memory: MemoryRecord = {
  confidence: 1,
  content: "Use Sequelize models for Arc persistence.",
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  id: "00000000-0000-4000-8000-000000000001",
  kind: "convention",
  pinned: false,
  projectId: "c7d0da58-9f18-4d86-89d7-53c372d95472",
  provenance: "assistant",
  scope: "project",
  updatedAt: "2026-01-01T00:00:00.000Z",
  usedAt: null,
};
