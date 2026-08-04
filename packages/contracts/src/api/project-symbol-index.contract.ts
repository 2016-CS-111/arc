import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";
import { ProjectSourceIndexIdSchema } from "./project-source-index.contract.js";

export const ProjectSymbolIndexIdSchema = z.string().uuid();
export const ProjectSymbolIndexStatusSchema = z.enum(["running", "completed", "limited", "failed"]);
export const ProjectSymbolIndexLimitReasonSchema = z.enum(["total_symbols"]);
export const ProjectSymbolIndexErrorCodeSchema = z.enum([
  "parser_unavailable",
  "symbol_persistence_error",
  "index_interrupted",
  "unknown_error",
]);
export const ProjectSymbolFileStatusSchema = z.enum([
  "parsed",
  "parsed_with_errors",
  "unsupported",
  "failed",
  "limited",
]);
export const ProjectSymbolFileErrorCodeSchema = z.enum([
  "source_changed",
  "source_read_error",
  "unsupported_language",
  "parse_error",
  "symbol_limit",
  "symbol_text_limit",
]);

export const ProjectSymbolIndexSchema = z
  .object({
    id: ProjectSymbolIndexIdSchema,
    projectId: ProjectIdSchema,
    sourceIndexRunId: ProjectSourceIndexIdSchema,
    status: ProjectSymbolIndexStatusSchema,
    parsedFileCount: z.number().int().nonnegative(),
    reusedFileCount: z.number().int().nonnegative(),
    unsupportedFileCount: z.number().int().nonnegative(),
    failedFileCount: z.number().int().nonnegative(),
    symbolCount: z.number().int().nonnegative(),
    omittedSymbolCount: z.number().int().nonnegative(),
    limitReasons: ProjectSymbolIndexLimitReasonSchema.array(),
    errorCode: ProjectSymbolIndexErrorCodeSchema.nullable(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, context) => {
    if ((value.status === "running") !== (value.completedAt === null)) {
      context.addIssue({
        code: "custom",
        message: "Running symbol indexes must be incomplete and terminal indexes must be completed.",
        path: ["completedAt"],
      });
    }
    if ((value.status === "failed") !== (value.errorCode !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only failed symbol indexes may have an error code.",
        path: ["errorCode"],
      });
    }
    if ((value.status === "limited") !== value.limitReasons.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Only limited symbol indexes may have limit reasons.",
        path: ["limitReasons"],
      });
    }
  });

export const ProjectSymbolCatalogSchema = z.object({
  symbolIndexId: ProjectSymbolIndexIdSchema,
  sourceIndexRunId: ProjectSourceIndexIdSchema,
  parsedFileCount: z.number().int().nonnegative(),
  reusedFileCount: z.number().int().nonnegative(),
  unsupportedFileCount: z.number().int().nonnegative(),
  failedFileCount: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  omittedSymbolCount: z.number().int().nonnegative(),
  completedAt: z.string().datetime(),
  stale: z.boolean(),
});

export const LatestProjectSymbolIndexResponseSchema = z.object({
  latestRun: ProjectSymbolIndexSchema.nullable(),
  currentCatalog: ProjectSymbolCatalogSchema.nullable(),
});

export type LatestProjectSymbolIndexResponse = z.infer<typeof LatestProjectSymbolIndexResponseSchema>;
export type ProjectSymbolCatalog = z.infer<typeof ProjectSymbolCatalogSchema>;
export type ProjectSymbolFileErrorCode = z.infer<typeof ProjectSymbolFileErrorCodeSchema>;
export type ProjectSymbolFileStatus = z.infer<typeof ProjectSymbolFileStatusSchema>;
export type ProjectSymbolIndex = z.infer<typeof ProjectSymbolIndexSchema>;
export type ProjectSymbolIndexErrorCode = z.infer<typeof ProjectSymbolIndexErrorCodeSchema>;
export type ProjectSymbolIndexLimitReason = z.infer<typeof ProjectSymbolIndexLimitReasonSchema>;
export type ProjectSymbolIndexStatus = z.infer<typeof ProjectSymbolIndexStatusSchema>;
