import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AgentPlanGenerationService } from "../application/agent-plan-generation.service.js";
import type { AgentPlanService } from "../application/agent-plan.service.js";
import { AgentPlanConflictError } from "../domain/agent-plan.errors.js";
import { AgentPlansController } from "./agent-plans.controller.js";

const projectId = "be1ce7ce-b4a6-419c-a6a2-38f499459c75";

describe("AgentPlansController", () => {
  it("validates and forwards task-plan generation", async () => {
    const create = vi.fn(() => Promise.resolve(plan()));
    const controller = new AgentPlansController(
      { create } as unknown as AgentPlanGenerationService,
      { get: vi.fn(), update: vi.fn() } as unknown as AgentPlanService,
    );

    await expect(controller.create({ goal: "Add categories", projectId })).resolves.toMatchObject({
      goal: "Add categories",
    });
    expect(create).toHaveBeenCalledWith({ goal: "Add categories", projectId }, expect.any(AbortSignal));
  });

  it("maps invalid, generation, and dependency failures to HTTP errors", async () => {
    const controller = new AgentPlansController(
      { create: vi.fn(() => Promise.reject(new Error("offline"))) } as unknown as AgentPlanGenerationService,
      {
        get: vi.fn(),
        update: vi.fn(() => {
          throw new AgentPlanConflictError("cycle");
        }),
      } as unknown as AgentPlanService,
    );

    await expect(controller.create({ goal: "missing project" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.create({ goal: "Add categories", projectId })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(() =>
      controller.update("f40d11a0-a990-4b7c-ba6c-8bd5077b0cee", { goal: "Add categories", steps: [step()] }),
    ).toThrow(ConflictException);
  });
});

function plan() {
  return {
    createdAt: "2026-08-05T00:00:00.000Z",
    goal: "Add categories",
    id: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
    projectId,
    status: "draft" as const,
    steps: [step()],
    totalEstimateMinutes: 5,
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function step() {
  return {
    dependsOn: [],
    description: "Inspect routes.",
    estimateMinutes: 5,
    id: "inspect",
    kind: "inspect" as const,
    title: "Inspect",
  };
}
