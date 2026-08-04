import { z } from "zod";
import { ProjectIdSchema } from "./project.contract.js";

export const ProjectFrameworkIndexStatusSchema = z.enum(["running", "completed", "limited", "failed"]);
export const ProjectFrameworkIndexLimitReasonSchema = z.enum([
  "source_catalog_limited",
  "symbol_catalog_limited",
  "dependency_catalog_limited",
  "upstream_file_gaps",
  "file_limits",
  "total_entities",
  "total_relationships",
]);
export const ProjectFrameworkIndexWarningSchema = z.enum(["package_metadata_invalid"]);
export const ProjectFrameworkIndexErrorCodeSchema = z.enum([
  "analyzer_unavailable",
  "upstream_catalog_changed",
  "framework_persistence_error",
  "index_interrupted",
  "unknown_error",
]);

export const ProjectFrameworkIndexSchema = z
  .object({
    id: z.string().uuid(),
    projectId: ProjectIdSchema,
    sourceIndexRunId: z.string().uuid(),
    symbolIndexRunId: z.string().uuid(),
    dependencyIndexRunId: z.string().uuid(),
    status: ProjectFrameworkIndexStatusSchema,
    analyzerSetIdentity: z.string().regex(/^[0-9a-f]{64}$/u),
    scopeCount: z.number().int().nonnegative(),
    analyzedFileCount: z.number().int().nonnegative(),
    reusedFileCount: z.number().int().nonnegative(),
    unsupportedFileCount: z.number().int().nonnegative(),
    failedFileCount: z.number().int().nonnegative(),
    entityCount: z.number().int().nonnegative(),
    relationshipCount: z.number().int().nonnegative(),
    unresolvedRelationshipCount: z.number().int().nonnegative(),
    omissionCount: z.number().int().nonnegative(),
    limitReasons: ProjectFrameworkIndexLimitReasonSchema.array(),
    warnings: ProjectFrameworkIndexWarningSchema.array(),
    errorCode: ProjectFrameworkIndexErrorCodeSchema.nullable(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, context) => {
    if ((value.status === "running") !== (value.completedAt === null)) {
      context.addIssue({
        code: "custom",
        message: "Running framework indexes must be incomplete and terminal indexes must be completed.",
        path: ["completedAt"],
      });
    }
    if ((value.status === "failed") !== (value.errorCode !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only failed framework indexes may have an error code.",
        path: ["errorCode"],
      });
    }
    if ((value.status === "limited") !== value.limitReasons.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Only limited framework indexes may have limit reasons.",
        path: ["limitReasons"],
      });
    }
    if (value.unresolvedRelationshipCount > value.relationshipCount) {
      context.addIssue({
        code: "custom",
        message: "Unresolved framework relationships cannot exceed the relationship count.",
        path: ["unresolvedRelationshipCount"],
      });
    }
  });
export const ProjectFrameworkCatalogStatusSchema = ProjectFrameworkIndexSchema.and(z.object({ stale: z.boolean() }));
export const LatestProjectFrameworkIndexResponseSchema = z.object({
  latestRun: ProjectFrameworkIndexSchema.nullable(),
  currentCatalog: ProjectFrameworkCatalogStatusSchema.nullable(),
});
export type ProjectFrameworkCatalogStatus = z.infer<typeof ProjectFrameworkCatalogStatusSchema>;
export type ProjectFrameworkIndex = z.infer<typeof ProjectFrameworkIndexSchema>;
export type ProjectFrameworkIndexErrorCode = z.infer<typeof ProjectFrameworkIndexErrorCodeSchema>;
export type ProjectFrameworkIndexLimitReason = z.infer<typeof ProjectFrameworkIndexLimitReasonSchema>;
export type ProjectFrameworkIndexStatus = z.infer<typeof ProjectFrameworkIndexStatusSchema>;
export type ProjectFrameworkIndexWarning = z.infer<typeof ProjectFrameworkIndexWarningSchema>;
export type LatestProjectFrameworkIndexResponse = z.infer<typeof LatestProjectFrameworkIndexResponseSchema>;
