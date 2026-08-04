import { z } from "zod";

import { ProjectIdSchema } from "./project.contract.js";
import { ProjectSourceIndexIdSchema } from "./project-source-index.contract.js";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

export const ProjectDependencyIndexIdSchema = z.string().uuid();
export const ProjectDependencyIndexStatusSchema = z.enum(["running", "completed", "limited", "failed"]);
export const ProjectDependencyIndexLimitReasonSchema = z.enum(["total_edges", "total_bindings"]);
export const ProjectDependencyIndexErrorCodeSchema = z.enum([
  "extractor_unavailable",
  "resolver_unavailable",
  "resolution_context_changed",
  "dependency_persistence_error",
  "index_interrupted",
  "unknown_error",
]);
export const ProjectDependencyFileStatusSchema = z.enum([
  "extracted",
  "extracted_with_errors",
  "unsupported",
  "failed",
  "limited",
]);
export const ProjectDependencyFileErrorCodeSchema = z.enum([
  "source_changed",
  "source_read_error",
  "unsupported_language",
  "parse_error",
  "dependency_limit",
  "dependency_text_limit",
]);
export const ProjectDependencyResolutionKindSchema = z.enum(["local", "external", "builtin", "unresolved"]);
export const ProjectDependencyResolverWarningCodeSchema = z.enum([
  "config_missing",
  "config_invalid",
  "config_extends_missing",
  "config_extends_outside_project",
  "config_extends_cycle",
  "package_metadata_invalid",
]);

export const ProjectDependencyIndexSchema = z
  .object({
    id: ProjectDependencyIndexIdSchema,
    projectId: ProjectIdSchema,
    sourceIndexRunId: ProjectSourceIndexIdSchema,
    status: ProjectDependencyIndexStatusSchema,
    resolutionContextHash: Sha256Schema.nullable(),
    parsedFileCount: z.number().int().nonnegative(),
    reusedFileCount: z.number().int().nonnegative(),
    unsupportedFileCount: z.number().int().nonnegative(),
    failedFileCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    bindingCount: z.number().int().nonnegative(),
    omittedEdgeCount: z.number().int().nonnegative(),
    omittedBindingCount: z.number().int().nonnegative(),
    localEdgeCount: z.number().int().nonnegative(),
    externalEdgeCount: z.number().int().nonnegative(),
    builtinEdgeCount: z.number().int().nonnegative(),
    unresolvedEdgeCount: z.number().int().nonnegative(),
    limitReasons: ProjectDependencyIndexLimitReasonSchema.array(),
    resolverWarnings: ProjectDependencyResolverWarningCodeSchema.array(),
    errorCode: ProjectDependencyIndexErrorCodeSchema.nullable(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, context) => {
    if ((value.status === "running") !== (value.completedAt === null)) {
      context.addIssue({
        code: "custom",
        message: "Running dependency indexes must be incomplete and terminal indexes must be completed.",
        path: ["completedAt"],
      });
    }
    if ((value.status === "failed") !== (value.errorCode !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only failed dependency indexes may have an error code.",
        path: ["errorCode"],
      });
    }
    if ((value.status === "limited") !== value.limitReasons.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Only limited dependency indexes may have limit reasons.",
        path: ["limitReasons"],
      });
    }
    if ((value.status === "completed" || value.status === "limited") && value.resolutionContextHash === null) {
      context.addIssue({
        code: "custom",
        message: "Published dependency indexes require a resolution context hash.",
        path: ["resolutionContextHash"],
      });
    }
    if (
      value.localEdgeCount + value.externalEdgeCount + value.builtinEdgeCount + value.unresolvedEdgeCount !==
      value.edgeCount
    ) {
      context.addIssue({
        code: "custom",
        message: "Dependency resolution counts must equal the total edge count.",
        path: ["edgeCount"],
      });
    }
  });

export const ProjectDependencyCatalogSchema = z.object({
  dependencyIndexId: ProjectDependencyIndexIdSchema,
  sourceIndexRunId: ProjectSourceIndexIdSchema,
  resolutionContextHash: Sha256Schema,
  parsedFileCount: z.number().int().nonnegative(),
  reusedFileCount: z.number().int().nonnegative(),
  unsupportedFileCount: z.number().int().nonnegative(),
  failedFileCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  bindingCount: z.number().int().nonnegative(),
  omittedEdgeCount: z.number().int().nonnegative(),
  omittedBindingCount: z.number().int().nonnegative(),
  localEdgeCount: z.number().int().nonnegative(),
  externalEdgeCount: z.number().int().nonnegative(),
  builtinEdgeCount: z.number().int().nonnegative(),
  unresolvedEdgeCount: z.number().int().nonnegative(),
  limitReasons: ProjectDependencyIndexLimitReasonSchema.array(),
  resolverWarnings: ProjectDependencyResolverWarningCodeSchema.array(),
  completedAt: z.string().datetime(),
  stale: z.boolean(),
});

export const LatestProjectDependencyIndexResponseSchema = z.object({
  latestRun: ProjectDependencyIndexSchema.nullable(),
  currentCatalog: ProjectDependencyCatalogSchema.nullable(),
});

export type LatestProjectDependencyIndexResponse = z.infer<typeof LatestProjectDependencyIndexResponseSchema>;
export type ProjectDependencyCatalog = z.infer<typeof ProjectDependencyCatalogSchema>;
export type ProjectDependencyFileErrorCode = z.infer<typeof ProjectDependencyFileErrorCodeSchema>;
export type ProjectDependencyFileStatus = z.infer<typeof ProjectDependencyFileStatusSchema>;
export type ProjectDependencyIndex = z.infer<typeof ProjectDependencyIndexSchema>;
export type ProjectDependencyIndexErrorCode = z.infer<typeof ProjectDependencyIndexErrorCodeSchema>;
export type ProjectDependencyIndexLimitReason = z.infer<typeof ProjectDependencyIndexLimitReasonSchema>;
export type ProjectDependencyIndexStatus = z.infer<typeof ProjectDependencyIndexStatusSchema>;
export type ProjectDependencyResolutionKind = z.infer<typeof ProjectDependencyResolutionKindSchema>;
export type ProjectDependencyResolverWarningCode = z.infer<typeof ProjectDependencyResolverWarningCodeSchema>;
