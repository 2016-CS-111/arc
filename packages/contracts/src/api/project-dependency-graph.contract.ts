import { z } from "zod";

import {
  ProjectDependencyIndexIdSchema,
  ProjectDependencyResolutionKindSchema,
} from "./project-dependency-index.contract.js";
import { ProjectRelativePathSchema } from "./project-ignore.contract.js";
import { ProjectIdSchema } from "./project.contract.js";
import { ProjectSourceIndexIdSchema } from "./project-source-index.contract.js";

export const ProjectDependencyGraphDirectionSchema = z.enum(["outgoing", "incoming", "both"]);
export const ProjectDependencyKindSchema = z.enum(["static_import", "reexport", "require", "dynamic_import"]);
export const ProjectDependencyBindingKindSchema = z.enum([
  "default",
  "named",
  "namespace",
  "side_effect",
  "import_equals",
  "reexport_named",
  "reexport_all",
  "commonjs_default",
  "commonjs_named",
]);
export const ProjectDependencyUnresolvedReasonSchema = z.enum([
  "not_found",
  "outside_project",
  "not_in_source_catalog",
  "invalid_specifier",
  "unsupported_scheme",
  "unsupported_resolution",
]);

const SourceCodeRangeSchema = z
  .object({
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().nonnegative(),
    startLine: z.number().int().nonnegative(),
    startColumnByte: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(),
    endColumnByte: z.number().int().nonnegative(),
  })
  .refine((range) => range.endByte >= range.startByte && range.endLine >= range.startLine, {
    message: "Source ranges must be ordered.",
  });

const ProjectDependencyKindsFilterSchema = z.preprocess(
  commaSeparatedValues,
  ProjectDependencyKindSchema.array()
    .max(ProjectDependencyKindSchema.options.length)
    .default([])
    .transform((values) => orderedUnique(values, ProjectDependencyKindSchema.options)),
);

const ProjectDependencyResolutionKindsFilterSchema = z.preprocess(
  commaSeparatedValues,
  ProjectDependencyResolutionKindSchema.array()
    .max(ProjectDependencyResolutionKindSchema.options.length)
    .default([])
    .transform((values) => orderedUnique(values, ProjectDependencyResolutionKindSchema.options)),
);

const QueryBooleanSchema = z.preprocess((value) => {
  if (value === undefined) {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value;
}, z.boolean());

export const ProjectDependencyGraphQuerySchema = z
  .object({
    path: ProjectRelativePathSchema,
    direction: ProjectDependencyGraphDirectionSchema.default("outgoing"),
    depth: z.coerce.number().int().min(1).max(5).default(1),
    dependencyKind: ProjectDependencyKindsFilterSchema,
    resolutionKind: ProjectDependencyResolutionKindsFilterSchema,
    maxNodes: z.coerce.number().int().min(1).max(500).default(100),
    maxEdges: z.coerce.number().int().min(1).max(2_000).default(500),
    includeBindings: QueryBooleanSchema,
  })
  .strict();

export const ProjectDependencyGraphFileNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("file"),
  sourceFileId: z.string().uuid(),
  path: ProjectRelativePathSchema,
});

export const ProjectDependencyGraphExternalNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("external"),
  packageName: z.string().min(1).max(1_024),
});

export const ProjectDependencyGraphBuiltinNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("builtin"),
  moduleName: z.string().min(1).max(1_024),
});

export const ProjectDependencyGraphNodeSchema = z.discriminatedUnion("kind", [
  ProjectDependencyGraphFileNodeSchema,
  ProjectDependencyGraphExternalNodeSchema,
  ProjectDependencyGraphBuiltinNodeSchema,
]);

export const ProjectDependencyGraphBindingSchema = z.object({
  bindingKey: z.string().regex(/^[0-9a-f]{64}$/u),
  kind: ProjectDependencyBindingKindSchema,
  importedName: z.string().min(1).max(512).nullable(),
  localName: z.string().min(1).max(512).nullable(),
  exportedName: z.string().min(1).max(512).nullable(),
  typeOnly: z.boolean(),
  range: SourceCodeRangeSchema.nullable(),
});

export const ProjectDependencyGraphEdgeSchema = z
  .object({
    id: z.string().uuid(),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1).nullable(),
    sourceFileId: z.string().uuid(),
    sourcePath: ProjectRelativePathSchema,
    targetSourceFileId: z.string().uuid().nullable(),
    targetPath: ProjectRelativePathSchema.nullable(),
    kind: ProjectDependencyKindSchema,
    specifier: z.string().min(1).max(1_024),
    typeOnly: z.boolean(),
    resolutionKind: ProjectDependencyResolutionKindSchema,
    externalPackage: z.string().min(1).max(1_024).nullable(),
    unresolvedReason: ProjectDependencyUnresolvedReasonSchema.nullable(),
    range: SourceCodeRangeSchema,
    specifierRange: SourceCodeRangeSchema,
    bindings: ProjectDependencyGraphBindingSchema.array(),
  })
  .superRefine((edge, context) => {
    const valid =
      (edge.resolutionKind === "local" &&
        edge.targetNodeId !== null &&
        edge.targetSourceFileId !== null &&
        edge.targetPath !== null &&
        edge.externalPackage === null &&
        edge.unresolvedReason === null) ||
      (edge.resolutionKind === "external" &&
        edge.targetNodeId !== null &&
        edge.targetSourceFileId === null &&
        edge.targetPath === null &&
        edge.externalPackage !== null &&
        edge.unresolvedReason === null) ||
      (edge.resolutionKind === "builtin" &&
        edge.targetNodeId !== null &&
        edge.targetSourceFileId === null &&
        edge.targetPath === null &&
        edge.externalPackage === null &&
        edge.unresolvedReason === null) ||
      (edge.resolutionKind === "unresolved" &&
        edge.targetNodeId === null &&
        edge.targetSourceFileId === null &&
        edge.targetPath === null &&
        edge.externalPackage === null &&
        edge.unresolvedReason !== null);
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Dependency graph edge targets must match their resolution kind.",
        path: ["resolutionKind"],
      });
    }
  });

export const ProjectDependencyGraphResponseSchema = z.object({
  projectId: ProjectIdSchema,
  dependencyIndexId: ProjectDependencyIndexIdSchema,
  sourceIndexRunId: ProjectSourceIndexIdSchema,
  startPath: ProjectRelativePathSchema,
  direction: ProjectDependencyGraphDirectionSchema,
  depth: z.number().int().min(1).max(5),
  nodes: ProjectDependencyGraphNodeSchema.array().max(500),
  edges: ProjectDependencyGraphEdgeSchema.array().max(2_000),
  truncated: z.object({
    depth: z.boolean(),
    nodes: z.boolean(),
    edges: z.boolean(),
  }),
});

export type ProjectDependencyGraphBinding = z.infer<typeof ProjectDependencyGraphBindingSchema>;
export type ProjectDependencyGraphDirection = z.infer<typeof ProjectDependencyGraphDirectionSchema>;
export type ProjectDependencyGraphEdge = z.infer<typeof ProjectDependencyGraphEdgeSchema>;
export type ProjectDependencyGraphNode = z.infer<typeof ProjectDependencyGraphNodeSchema>;
export type ProjectDependencyGraphQuery = z.infer<typeof ProjectDependencyGraphQuerySchema>;
export type ProjectDependencyGraphResponse = z.infer<typeof ProjectDependencyGraphResponseSchema>;
export type ProjectDependencyKind = z.infer<typeof ProjectDependencyKindSchema>;

function commaSeparatedValues(value: unknown): unknown {
  if (value === undefined) {
    return [];
  }
  const values: readonly unknown[] = Array.isArray(value) ? (value as readonly unknown[]) : [value];
  return values.flatMap((item) => (typeof item === "string" ? item.split(",") : [item])).filter((item) => item !== "");
}

function orderedUnique<T extends string>(values: readonly T[], order: readonly T[]): T[] {
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}
