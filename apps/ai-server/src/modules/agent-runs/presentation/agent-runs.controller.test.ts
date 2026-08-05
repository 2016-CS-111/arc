import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AgentRunService } from "../application/agent-run.service.js";
import { AgentRunNotFoundError, AgentRunStateError } from "../domain/agent-run.errors.js";
import { AgentRunsController } from "./agent-runs.controller.js";

const planId = "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee";
const runId = "5efae680-025a-41ff-8133-482c50538bd4";

describe("AgentRunsController", () => {
  it("creates and transitions a typed task run", () => {
    const create = vi.fn(() => run());
    const start = vi.fn(() => ({ ...run(), status: "running" as const }));
    const controller = new AgentRunsController({ create, start } as unknown as AgentRunService);

    expect(controller.create({ planId })).toMatchObject({ id: runId, status: "pending" });
    expect(controller.start(runId)).toMatchObject({ status: "running" });
    expect(create).toHaveBeenCalledWith(planId);
  });

  it("maps invalid and state errors to HTTP errors", () => {
    const controller = new AgentRunsController({
      create: vi.fn(() => {
        throw new AgentRunNotFoundError(planId);
      }),
      resume: vi.fn(() => {
        throw new AgentRunStateError("Only a paused task run can resume.");
      }),
    } as unknown as AgentRunService);

    expect(() => controller.create({})).toThrow(BadRequestException);
    expect(() => controller.create({ planId })).toThrow(NotFoundException);
    expect(() => controller.resume(runId)).toThrow(ConflictException);
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
