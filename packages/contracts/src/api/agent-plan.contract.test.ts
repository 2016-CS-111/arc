import { describe, expect, it } from "vitest";

import { AgentPlanSchema, AgentPlanUpdateRequestSchema } from "./agent-plan.contract.js";

describe("agent plan contracts", () => {
  it("accepts a bounded editable draft plan", () => {
    const plan = AgentPlanSchema.parse({
      createdAt: "2026-08-05T00:00:00.000Z",
      goal: "Add categories",
      id: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
      projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
      status: "draft",
      steps: [
        {
          dependsOn: [],
          description: "Inspect the current routes.",
          estimateMinutes: 5,
          id: "inspect",
          kind: "inspect",
          title: "Inspect",
        },
      ],
      totalEstimateMinutes: 5,
      updatedAt: "2026-08-05T00:00:00.000Z",
    });

    expect(AgentPlanUpdateRequestSchema.parse({ goal: plan.goal, steps: plan.steps })).toMatchObject({
      goal: "Add categories",
    });
  });
});
