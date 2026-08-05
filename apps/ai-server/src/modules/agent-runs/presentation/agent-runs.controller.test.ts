import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { AgentRunReport } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { AgentRunService } from "../application/agent-run.service.js";
import { AgentRunNotFoundError, AgentRunStateError } from "../domain/agent-run.errors.js";
import { AgentRunsController } from "./agent-runs.controller.js";

const planId = "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee";
const runId = "5efae680-025a-41ff-8133-482c50538bd4";

describe("AgentRunsController", () => {
  it("creates and transitions a typed task run", async () => {
    const create = vi.fn(() => Promise.resolve(run()));
    const start = vi.fn(() => Promise.resolve({ ...run(), status: "running" as const }));
    const report = vi.fn(() => taskReport());
    const controller = new AgentRunsController({ create, report, start } as unknown as AgentRunService);

    await expect(controller.create({ planId })).resolves.toMatchObject({ id: runId, status: "pending" });
    await expect(controller.start(runId)).resolves.toMatchObject({ status: "running" });
    expect(controller.report(runId)).toMatchObject({ outcome: "Task run completed." });
    expect(create).toHaveBeenCalledWith(planId);
  });

  it("maps invalid and state errors to HTTP errors", async () => {
    const controller = new AgentRunsController({
      create: vi.fn(() => {
        throw new AgentRunNotFoundError(planId);
      }),
      resume: vi.fn(() => {
        throw new AgentRunStateError("Only a paused task run can resume.");
      }),
    } as unknown as AgentRunService);

    await expect(controller.create({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.create({ planId })).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.resume(runId)).rejects.toBeInstanceOf(ConflictException);
  });
});

function run() {
  return {
    activeStepId: null,
    budget: { maxRepairAttempts: 2, maxToolCalls: 3, repairAttempts: 0, toolCallsUsed: 0 },
    createdAt: "2026-08-05T00:00:00.000Z",
    goal: "Improve categories",
    id: runId,
    planId,
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    status: "pending" as const,
    steps: [
      {
        artifacts: [],
        attempt: 1,
        checkpoint: null,
        status: "pending" as const,
        step: {
          dependsOn: [],
          description: "Inspect categories.",
          estimateMinutes: 5,
          id: "inspect",
          kind: "inspect" as const,
          title: "Inspect",
        },
        toolCallsUsed: 0,
      },
    ],
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function taskReport(): AgentRunReport {
  return {
    changes: [],
    outcome: "Task run completed.",
    rollbackGuidance: ["No applied Arc edit proposals are recorded."],
    run: { ...run(), status: "completed" },
    tests: [],
  };
}
