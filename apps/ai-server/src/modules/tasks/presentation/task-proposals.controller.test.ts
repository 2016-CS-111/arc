import type { TaskProposal } from "@arc/contracts";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { TaskProposalService } from "../application/task-proposal.service.js";
import { TaskProposalsController } from "./task-proposals.controller.js";

describe("TaskProposalsController", () => {
  it("requires an explicit confirmation before starting a staged command", () => {
    const start = vi.fn(() => proposal());
    const controller = new TaskProposalsController({ start } as unknown as TaskProposalService);

    expect(controller.approve(proposal().id, { confirmed: true })).toEqual(proposal());
    expect(start).toHaveBeenCalledWith(proposal().id, { confirmed: true });
    expect(() => controller.approve(proposal().id, {})).toThrow(BadRequestException);
  });
});

function proposal(): TaskProposal {
  return {
    approval: { kind: "workspace_write", required: true },
    command: { args: ["run", "format"], cwd: "/workspace/project", executable: "pnpm" },
    createdAt: "2026-08-05T00:00:00.000Z",
    durationMs: null,
    exitCode: null,
    id: "f89569c8-ec41-4b89-94b0-5462cd299dd1",
    kind: "preset",
    mutates: true,
    output: "",
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    requestId: "request_1",
    sessionId: "89ea5830-8a8e-4141-a5bb-1f4a2d2b655f",
    status: "pending",
    title: "Format",
    truncated: false,
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}
