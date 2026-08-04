import { z } from "zod";

import { EditProposalSchema } from "./edit.contract.js";
import { ProjectIdSchema } from "./project.contract.js";
import { TaskProposalSchema } from "./task.contract.js";

export const GuidedCodeActionKindSchema = z.enum([
  "explain",
  "fix_diagnostic",
  "simplify",
  "extract_function",
  "rename_symbol",
  "add_tests",
  "add_documentation",
]);

const PositionSchema = z
  .object({ character: z.number().int().nonnegative(), line: z.number().int().nonnegative() })
  .strict();

export const GuidedCodeActionRangeSchema = z.object({ end: PositionSchema, start: PositionSchema }).strict();

export const GuidedCodeActionRequestSchema = z
  .object({
    action: GuidedCodeActionKindSchema,
    diagnostic: z.string().trim().min(1).max(4_000).nullable().default(null),
    language: z.string().trim().min(1).max(64),
    path: z.string().trim().min(1).max(4_096),
    projectId: ProjectIdSchema,
    range: GuidedCodeActionRangeSchema.nullable().default(null),
    requestId: z.string().uuid(),
    source: z.string().min(1).max(24_000),
    sourceVersion: z.number().int().nonnegative(),
  })
  .strict();

export const GuidedCodeActionResponseSchema = z
  .object({
    explanation: z.string().trim().min(1).max(8_000),
    proposal: EditProposalSchema.nullable(),
    validation: TaskProposalSchema.nullable(),
  })
  .strict();

export type GuidedCodeActionKind = z.infer<typeof GuidedCodeActionKindSchema>;
export type GuidedCodeActionRange = z.infer<typeof GuidedCodeActionRangeSchema>;
export type GuidedCodeActionRequest = z.infer<typeof GuidedCodeActionRequestSchema>;
export type GuidedCodeActionResponse = z.infer<typeof GuidedCodeActionResponseSchema>;
