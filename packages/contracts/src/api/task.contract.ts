import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";

const TaskProposalIdSchema = z.string().uuid();
const TaskIdentifierSchema = z.string().min(1).max(160);
const RelativePathSchema = z.string().min(1).max(4_096);

export const TaskPresetSchema = z.enum(["test", "lint", "typecheck", "build", "format"]);

export const GitTaskOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add"), paths: z.array(RelativePathSchema).min(1).max(50) }),
  z.object({ message: z.string().trim().min(1).max(500), operation: z.literal("commit") }),
  z.object({ name: z.string().trim().min(1).max(120), operation: z.literal("branch") }),
  z.object({ branch: z.string().trim().min(1).max(120), operation: z.literal("merge") }),
  z.object({ operation: z.literal("restore"), paths: z.array(RelativePathSchema).min(1).max(50) }),
  z.object({ message: z.string().trim().min(1).max(500).optional(), operation: z.literal("stash") }),
]);

export const TaskProposalRequestSchema = z.discriminatedUnion("type", [
  z.object({ preset: TaskPresetSchema, type: z.literal("preset") }),
  z.object({ script: z.string().trim().min(1).max(120), type: z.literal("package_script") }),
  z.object({ git: GitTaskOperationSchema, type: z.literal("git") }),
]);

export const TaskExecutionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "rejected",
]);

export const TaskCommandSchema = z.object({
  args: z.array(z.string().max(4_096)).max(100),
  cwd: z.string().min(1),
  executable: z.string().min(1).max(160),
});

export const TaskProposalSchema = z.object({
  command: TaskCommandSchema,
  createdAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative().nullable(),
  exitCode: z.number().int().nullable(),
  id: TaskProposalIdSchema,
  kind: z.enum(["preset", "package_script", "git"]),
  mutates: z.boolean(),
  output: z.string().max(65_536),
  projectId: ProjectIdSchema,
  requestId: TaskIdentifierSchema,
  sessionId: z.string().uuid(),
  status: TaskExecutionStatusSchema,
  title: z.string().min(1).max(160),
  truncated: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type GitTaskOperation = z.infer<typeof GitTaskOperationSchema>;
export type TaskCommand = z.infer<typeof TaskCommandSchema>;
export type TaskExecutionStatus = z.infer<typeof TaskExecutionStatusSchema>;
export type TaskPreset = z.infer<typeof TaskPresetSchema>;
export type TaskProposal = z.infer<typeof TaskProposalSchema>;
export type TaskProposalRequest = z.infer<typeof TaskProposalRequestSchema>;
