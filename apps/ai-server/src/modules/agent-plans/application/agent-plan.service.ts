import { randomUUID } from "node:crypto";

import {
  AgentPlanCreateRequestSchema,
  AgentPlanSchema,
  AgentPlanUpdateRequestSchema,
  type AgentPlan,
  type AgentPlanCreateRequest,
  type AgentPlanStep,
  type AgentPlanUpdateRequest,
} from "@arc/contracts";
import { Injectable } from "@nestjs/common";

import { AgentPlanConflictError, AgentPlanNotFoundError } from "../domain/agent-plan.errors.js";

@Injectable()
export class AgentPlanService {
  private readonly plans = new Map<string, AgentPlan>();

  public create(input: AgentPlanCreateRequest & { readonly steps: readonly AgentPlanStep[] }): AgentPlan {
    const request = AgentPlanCreateRequestSchema.parse({ goal: input.goal, projectId: input.projectId });
    const steps = this.order(input.steps);
    const now = new Date().toISOString();
    const plan = AgentPlanSchema.parse({
      createdAt: now,
      goal: request.goal,
      id: randomUUID(),
      projectId: request.projectId,
      status: "draft",
      steps,
      totalEstimateMinutes: totalEstimate(steps),
      updatedAt: now,
    });
    this.plans.set(plan.id, plan);
    return structuredClone(plan);
  }

  public get(planId: string): AgentPlan {
    return structuredClone(this.requirePlan(planId));
  }

  public update(planId: string, input: AgentPlanUpdateRequest): AgentPlan {
    const request = AgentPlanUpdateRequestSchema.parse(input);
    const current = this.requirePlan(planId);
    const steps = this.order(request.steps);
    const plan = AgentPlanSchema.parse({
      ...current,
      goal: request.goal,
      steps,
      totalEstimateMinutes: totalEstimate(steps),
      updatedAt: new Date().toISOString(),
    });
    this.plans.set(plan.id, plan);
    return structuredClone(plan);
  }

  private order(steps: readonly AgentPlanStep[]): AgentPlanStep[] {
    const byId = new Map<string, AgentPlanStep>();
    for (const step of steps) {
      if (byId.has(step.id)) throw new AgentPlanConflictError(`Task plan step ${step.id} is duplicated.`);
      byId.set(step.id, step);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const ordered: AgentPlanStep[] = [];
    const visit = (step: AgentPlanStep): void => {
      if (visited.has(step.id)) return;
      if (visiting.has(step.id)) throw new AgentPlanConflictError("Task plan dependencies contain a cycle.");
      visiting.add(step.id);
      for (const dependencyId of step.dependsOn) {
        const dependency = byId.get(dependencyId);
        if (dependency === undefined) {
          throw new AgentPlanConflictError(`Task plan step ${step.id} depends on unknown step ${dependencyId}.`);
        }
        visit(dependency);
      }
      visiting.delete(step.id);
      visited.add(step.id);
      ordered.push(step);
    };

    for (const step of steps) visit(step);
    return ordered;
  }

  private requirePlan(planId: string): AgentPlan {
    const plan = this.plans.get(planId);
    if (plan === undefined) throw new AgentPlanNotFoundError(planId);
    return plan;
  }
}

function totalEstimate(steps: readonly AgentPlanStep[]): number {
  return steps.reduce((total, step) => total + step.estimateMinutes, 0);
}
