import { z } from "zod";

import { AgentPlanIdSchema, AgentPlanStepSchema } from "./agent-plan.contract.js";
import { ProjectIdSchema } from "./project.contract.js";

const AgentRunIdSchema = z.string().uuid();

export const AgentRunStatusSchema = z.enum(["pending", "running", "paused", "completed", "cancelled", "failed"]);
export const AgentRunStepStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const AgentRunStepSchema = z
  .object({
    checkpoint: z.string().trim().min(1).max(8_000).nullable(),
    status: AgentRunStepStatusSchema,
    step: AgentPlanStepSchema,
    toolCallsUsed: z.number().int().nonnegative(),
  })
  .strict();

export const AgentRunBudgetSchema = z
  .object({ maxToolCalls: z.number().int().positive().max(60), toolCallsUsed: z.number().int().nonnegative() })
  .strict()
  .refine((budget) => budget.toolCallsUsed <= budget.maxToolCalls, "Tool-call budget cannot be exceeded.");

export const AgentRunCreateRequestSchema = z.object({ planId: AgentPlanIdSchema }).strict();

export const AgentRunSchema = z
  .object({
    activeStepId: z.string().nullable(),
    budget: AgentRunBudgetSchema,
    createdAt: z.string().datetime(),
    goal: z.string().trim().min(1).max(4_000),
    id: AgentRunIdSchema,
    planId: AgentPlanIdSchema,
    projectId: ProjectIdSchema,
    status: AgentRunStatusSchema,
    steps: AgentRunStepSchema.array().min(1).max(20),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentRunBudget = z.infer<typeof AgentRunBudgetSchema>;
export type AgentRunCreateRequest = z.infer<typeof AgentRunCreateRequestSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunStep = z.infer<typeof AgentRunStepSchema>;
