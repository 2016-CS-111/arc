import { z } from "zod";

import { AgentPlanIdSchema, AgentPlanStepSchema } from "./agent-plan.contract.js";
import { ProjectIdSchema } from "./project.contract.js";

const AgentRunIdSchema = z.string().uuid();
const AgentRunProposalIdSchema = z.string().uuid();

export const AgentRunStatusSchema = z.enum(["pending", "running", "paused", "completed", "cancelled", "failed"]);
export const AgentRunStepStatusSchema = z.enum(["pending", "running", "waiting", "completed", "failed"]);
export const AgentRunArtifactKindSchema = z.enum(["edit", "task"]);
export const AgentRunArtifactStatusSchema = z.enum([
  "pending",
  "running",
  "applied",
  "rejected",
  "undone",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
]);

export const AgentRunArtifactSchema = z
  .object({
    kind: AgentRunArtifactKindSchema,
    proposalId: AgentRunProposalIdSchema,
    status: AgentRunArtifactStatusSchema,
    summary: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict();

export const AgentRunStepSchema = z
  .object({
    artifacts: AgentRunArtifactSchema.array().max(12),
    attempt: z.number().int().min(1).max(3),
    checkpoint: z.string().trim().min(1).max(8_000).nullable(),
    status: AgentRunStepStatusSchema,
    step: AgentPlanStepSchema,
    toolCallsUsed: z.number().int().nonnegative(),
  })
  .strict();

export const AgentRunBudgetSchema = z
  .object({
    maxRepairAttempts: z.number().int().min(1).max(2),
    maxToolCalls: z.number().int().positive().max(60),
    repairAttempts: z.number().int().nonnegative(),
    toolCallsUsed: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (budget) => budget.toolCallsUsed <= budget.maxToolCalls && budget.repairAttempts <= budget.maxRepairAttempts,
    "Task-run budget cannot be exceeded.",
  );

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
export type AgentRunArtifact = z.infer<typeof AgentRunArtifactSchema>;
export type AgentRunArtifactKind = z.infer<typeof AgentRunArtifactKindSchema>;
export type AgentRunArtifactStatus = z.infer<typeof AgentRunArtifactStatusSchema>;
export type AgentRunBudget = z.infer<typeof AgentRunBudgetSchema>;
export type AgentRunCreateRequest = z.infer<typeof AgentRunCreateRequestSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunStep = z.infer<typeof AgentRunStepSchema>;
