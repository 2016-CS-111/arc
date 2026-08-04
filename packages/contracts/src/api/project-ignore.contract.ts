import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";

export const ProjectRelativePathSchema = z.string().min(1).max(4_096);
export const ProjectPathKindSchema = z.enum(["file", "directory"]);
export const ProjectIgnoreSourceSchema = z.enum([
  "none",
  "built_in_safety",
  "built_in_generated",
  "gitignore",
  "arcignore",
]);

export const CheckProjectPathRequestSchema = z.object({
  path: ProjectRelativePathSchema,
  kind: ProjectPathKindSchema,
});

export const ProjectIgnoreReasonSchema = z.object({
  source: ProjectIgnoreSourceSchema,
  sourcePath: ProjectRelativePathSchema.nullable(),
  pattern: z.string().min(1).nullable(),
});

export const ProjectIgnoreDecisionSchema = z.object({
  projectId: ProjectIdSchema,
  path: ProjectRelativePathSchema,
  kind: ProjectPathKindSchema,
  ignored: z.boolean(),
  reason: ProjectIgnoreReasonSchema,
});

export type CheckProjectPathRequest = z.infer<typeof CheckProjectPathRequestSchema>;
export type ProjectIgnoreDecision = z.infer<typeof ProjectIgnoreDecisionSchema>;
export type ProjectIgnoreReason = z.infer<typeof ProjectIgnoreReasonSchema>;
export type ProjectIgnoreSource = z.infer<typeof ProjectIgnoreSourceSchema>;
export type ProjectPathKind = z.infer<typeof ProjectPathKindSchema>;
