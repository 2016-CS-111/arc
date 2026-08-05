import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";

export const AgentPlanIdSchema = z.string().uuid();
const AgentPlanStepIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{0,47}$/u);

export const AgentPlanStepKindSchema = z.enum(["inspect", "edit", "test"]);

export const AgentPlanStepSchema = z
  .object({
    dependsOn: AgentPlanStepIdSchema.array().max(12),
    description: z.string().trim().min(1).max(2_000),
    estimateMinutes: z.number().int().min(1).max(240),
    id: AgentPlanStepIdSchema,
    kind: AgentPlanStepKindSchema,
    title: z.string().trim().min(1).max(160),
  })
  .strict();

export const AgentPlanDraftSchema = z
  .object({
    goal: z.string().trim().min(1).max(4_000),
    steps: AgentPlanStepSchema.array().min(1).max(20),
  })
  .strict();

export const AgentPlanCreateRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(4_000),
    projectId: ProjectIdSchema,
  })
  .strict();

export const AgentPlanUpdateRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(4_000),
    steps: AgentPlanStepSchema.array().min(1).max(20),
  })
  .strict();

export const AgentPlanSchema = z
  .object({
    createdAt: z.string().datetime(),
    goal: z.string().trim().min(1).max(4_000),
    id: AgentPlanIdSchema,
    projectId: ProjectIdSchema,
    status: z.literal("draft"),
    steps: AgentPlanStepSchema.array().min(1).max(20),
    totalEstimateMinutes: z.number().int().positive(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type AgentPlan = z.infer<typeof AgentPlanSchema>;
export type AgentPlanCreateRequest = z.infer<typeof AgentPlanCreateRequestSchema>;
export type AgentPlanDraft = z.infer<typeof AgentPlanDraftSchema>;
export type AgentPlanStep = z.infer<typeof AgentPlanStepSchema>;
export type AgentPlanStepKind = z.infer<typeof AgentPlanStepKindSchema>;
export type AgentPlanUpdateRequest = z.infer<typeof AgentPlanUpdateRequestSchema>;
