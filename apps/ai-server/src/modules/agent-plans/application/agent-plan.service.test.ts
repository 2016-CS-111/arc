import type { AgentPlanStep } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { AgentPlanConflictError } from "../domain/agent-plan.errors.js";
import { AgentPlanService } from "./agent-plan.service.js";

const projectId = "be1ce7ce-b4a6-419c-a6a2-38f499459c75";

describe("AgentPlanService", () => {
  it("orders a plan after its dependencies and totals estimates", () => {
    const service = new AgentPlanService();

    const plan = service.create({
      goal: "Add categories",
      projectId,
      steps: [
        step("test", ["edit"], "test", 10),
        step("edit", ["inspect"], "edit", 20),
        step("inspect", [], "inspect", 5),
      ],
    });

    expect(plan.steps.map((step) => step.id)).toEqual(["inspect", "edit", "test"]);
    expect(plan.totalEstimateMinutes).toBe(35);
  });

  it("keeps plans editable while preserving dependency safety", () => {
    const service = new AgentPlanService();
    const plan = service.create({ goal: "Improve docs", projectId, steps: [step("inspect", [], "inspect", 5)] });

    const updated = service.update(plan.id, {
      goal: "Improve docs and tests",
      steps: [
        step("test", ["edit"], "test", 10),
        step("edit", ["inspect"], "edit", 15),
        step("inspect", [], "inspect", 5),
      ],
    });

    expect(updated.steps.map((step) => step.id)).toEqual(["inspect", "edit", "test"]);
    expect(updated.goal).toBe("Improve docs and tests");
    expect(service.get(plan.id)).toEqual(updated);
  });

  it("rejects unknown and cyclic dependencies", () => {
    const service = new AgentPlanService();

    expect(() => service.create({ goal: "Unknown", projectId, steps: [step("edit", ["missing"], "edit", 5)] })).toThrow(
      AgentPlanConflictError,
    );
    expect(() =>
      service.create({
        goal: "Cycle",
        projectId,
        steps: [step("one", ["two"], "edit", 5), step("two", ["one"], "test", 5)],
      }),
    ).toThrow("contain a cycle");
  });
});

function step(
  id: string,
  dependsOn: readonly string[],
  kind: AgentPlanStep["kind"],
  estimateMinutes: number,
): AgentPlanStep {
  return { dependsOn: [...dependsOn], description: `${id} description`, estimateMinutes, id, kind, title: id };
}
