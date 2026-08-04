import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";

const EditProposalIdSchema = z.string().uuid();
const EditOperationIdSchema = z.string().uuid();
const RelativePathSchema = z.string().min(1).max(4_096);
const EditContentSchema = z.string().max(32_768);

export const EditOperationInputSchema = z.discriminatedUnion("type", [
  z.object({ content: EditContentSchema, path: RelativePathSchema, type: z.literal("create") }),
  z.object({ content: EditContentSchema, path: RelativePathSchema, type: z.literal("update") }),
  z.object({ path: RelativePathSchema, type: z.literal("delete") }),
  z.object({ fromPath: RelativePathSchema, path: RelativePathSchema, type: z.literal("move") }),
]);

export const EditProposalRequestSchema = z.object({
  operations: z.array(EditOperationInputSchema).min(1).max(20),
});

export const EditProposalStatusSchema = z.enum(["pending", "rejected", "applied", "undone", "failed"]);

export const EditProposalOperationSchema = z.object({
  after: z.string().nullable(),
  before: z.string().nullable(),
  fromPath: RelativePathSchema.optional(),
  id: EditOperationIdSchema,
  path: RelativePathSchema,
  type: z.enum(["create", "update", "delete", "move"]),
});

export const EditProposalSchema = z.object({
  createdAt: z.string().datetime(),
  id: EditProposalIdSchema,
  operations: z.array(EditProposalOperationSchema).min(1).max(20),
  projectId: ProjectIdSchema,
  rootPath: z.string().min(1),
  sessionId: z.string().uuid(),
  status: EditProposalStatusSchema,
  updatedAt: z.string().datetime(),
});

export const EditProposalSelectionSchema = z.object({
  operationIds: z.array(EditOperationIdSchema).min(1).max(20),
});

export type EditOperationInput = z.infer<typeof EditOperationInputSchema>;
export type EditProposal = z.infer<typeof EditProposalSchema>;
export type EditProposalOperation = z.infer<typeof EditProposalOperationSchema>;
export type EditProposalRequest = z.infer<typeof EditProposalRequestSchema>;
export type EditProposalSelection = z.infer<typeof EditProposalSelectionSchema>;
export type EditProposalStatus = z.infer<typeof EditProposalStatusSchema>;
