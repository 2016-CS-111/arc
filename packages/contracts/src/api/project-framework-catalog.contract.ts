import { z } from "zod";

import { ProjectFrameworkIndexSchema } from "./project-framework-index.contract.js";
import { ProjectRelativePathSchema } from "./project-ignore.contract.js";
import { ProjectIdSchema } from "./project.contract.js";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const BoundedTextSchema = z.string().min(1).max(4_096);
const NullableBoundedTextSchema = BoundedTextSchema.nullable();
const StaticTextArraySchema = BoundedTextSchema.array().max(100);

export const ProjectFrameworkKindSchema = z.enum(["nestjs", "express", "nextjs", "react", "sequelize"]);
export const ProjectFrameworkEntityKindSchema = z.enum([
  "module",
  "controller",
  "provider",
  "application",
  "router",
  "route",
  "middleware",
  "page",
  "layout",
  "route_handler",
  "component",
  "model",
  "model_attribute",
]);
export const ProjectFrameworkRelationshipKindSchema = z.enum([
  "contains",
  "registers_controller",
  "registers_provider",
  "imports_module",
  "exports_provider",
  "injects",
  "handles_route",
  "mounts_router",
  "uses_middleware",
  "renders_component",
  "defines_attribute",
  "associates",
  "wraps",
]);
export const ProjectFrameworkCertaintySchema = z.enum(["declared", "convention", "linked", "unresolved"]);
export const ProjectFrameworkEvidenceKindSchema = z.enum([
  "package_metadata",
  "import_binding",
  "decorator",
  "call_expression",
  "class_heritage",
  "jsx",
  "directive",
  "constructor_parameter",
  "file_convention",
  "catalog_link",
]);

export const ProjectFrameworkSourceRangeSchema = z
  .object({
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().nonnegative(),
    startLine: z.number().int().nonnegative(),
    startColumnByte: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(),
    endColumnByte: z.number().int().nonnegative(),
  })
  .strict()
  .refine((range) => range.endByte >= range.startByte && range.endLine >= range.startLine, {
    message: "Framework source ranges must be ordered.",
  });

const HttpMethodSchema = z.enum(["ALL", "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);
const RouteHttpMethodSchema = z.enum(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);

export const ProjectFrameworkEntityAttributesSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("nest_module"), dynamicMetadata: z.boolean() }).strict(),
  z.object({ kind: z.literal("nest_controller"), dynamicPath: z.boolean(), paths: StaticTextArraySchema }).strict(),
  z
    .object({
      kind: z.literal("nest_provider"),
      origin: z.enum(["injectable", "module_registration"]),
      token: BoundedTextSchema,
      useClass: NullableBoundedTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("nest_route"),
      controllerName: BoundedTextSchema,
      controllerPaths: StaticTextArraySchema,
      dynamicPath: z.boolean(),
      fullPaths: StaticTextArraySchema,
      handlerName: BoundedTextSchema,
      httpMethod: HttpMethodSchema,
      methodPaths: StaticTextArraySchema,
    })
    .strict(),
  z.object({ kind: z.literal("express_application"), localName: BoundedTextSchema }).strict(),
  z.object({ kind: z.literal("express_router"), localName: BoundedTextSchema }).strict(),
  z
    .object({
      kind: z.literal("express_route"),
      dynamicPath: z.boolean(),
      handlerNames: StaticTextArraySchema,
      httpMethod: HttpMethodSchema,
      ownerName: BoundedTextSchema,
      paths: StaticTextArraySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("express_middleware"),
      dynamicPath: z.boolean(),
      errorHandler: z.boolean(),
      handlerName: NullableBoundedTextSchema,
      ownerName: BoundedTextSchema,
      paths: StaticTextArraySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("next_page"),
      clientBoundary: z.boolean(),
      routePattern: NullableBoundedTextSchema,
      router: z.enum(["app", "pages"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("next_layout"),
      clientBoundary: z.boolean(),
      role: z.enum(["default", "error", "global-error", "layout", "loading", "not-found", "template"]),
      routePattern: NullableBoundedTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("next_route_handler"),
      httpMethod: RouteHttpMethodSchema.nullable(),
      routePattern: NullableBoundedTextSchema,
      router: z.enum(["app", "pages"]),
    })
    .strict(),
  z.object({ kind: z.literal("next_special_file"), role: z.enum(["_app", "_document", "_error"]) }).strict(),
  z
    .object({
      kind: z.literal("react_component"),
      clientBoundary: z.boolean(),
      wrapper: z.enum(["forwardRef", "memo"]).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sequelize_model"),
      modelName: NullableBoundedTextSchema,
      origin: z.enum(["class_init", "define"]),
      tableName: NullableBoundedTextSchema,
      timestamps: z.boolean().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sequelize_model_attribute"),
      allowNull: z.boolean().nullable(),
      field: NullableBoundedTextSchema,
      modelName: BoundedTextSchema,
      primaryKey: z.boolean().nullable(),
      typeName: NullableBoundedTextSchema,
      unique: z.boolean().nullable(),
    })
    .strict(),
]);

export const ProjectFrameworkRelationshipAttributesSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("nest_module_registration"),
      section: z.enum(["controllers", "exports", "imports", "providers"]),
    })
    .strict(),
  z.object({ kind: z.literal("nest_route_ownership"), httpMethod: HttpMethodSchema }).strict(),
  z
    .object({
      kind: z.literal("nest_injection"),
      parameterIndex: z.number().int().nonnegative().nullable(),
      parameterName: NullableBoundedTextSchema,
      tokenKind: z.enum(["identifier", "string", "unknown"]),
    })
    .strict(),
  z.object({ kind: z.literal("express_route_ownership"), httpMethod: HttpMethodSchema }).strict(),
  z
    .object({
      kind: z.literal("express_middleware_registration"),
      errorHandler: z.boolean(),
      paths: StaticTextArraySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("express_router_mount"),
      dynamicPath: z.boolean(),
      paths: StaticTextArraySchema,
    })
    .strict(),
  z.object({ kind: z.literal("next_component_ownership") }).strict(),
  z.object({ kind: z.literal("react_component_render") }).strict(),
  z
    .object({
      kind: z.literal("react_component_wrapper"),
      wrapper: z.enum(["forwardRef", "memo"]).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sequelize_association"),
      association: z.enum(["belongsTo", "belongsToMany", "hasMany", "hasOne"]),
      foreignKey: NullableBoundedTextSchema,
      targetKey: NullableBoundedTextSchema,
      through: NullableBoundedTextSchema,
    })
    .strict(),
  z.object({ kind: z.literal("sequelize_model_attribute") }).strict(),
]);

const FrameworkFilterSchema = z.preprocess(
  commaSeparatedValues,
  ProjectFrameworkKindSchema.array()
    .max(ProjectFrameworkKindSchema.options.length)
    .default([])
    .transform((values) => orderedUnique(values, ProjectFrameworkKindSchema.options)),
);
const EntityKindFilterSchema = z.preprocess(
  commaSeparatedValues,
  ProjectFrameworkEntityKindSchema.array()
    .max(ProjectFrameworkEntityKindSchema.options.length)
    .default([])
    .transform((values) => orderedUnique(values, ProjectFrameworkEntityKindSchema.options)),
);
const QueryBooleanSchema = z.preprocess((value) => {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const ProjectFrameworkCatalogQuerySchema = z
  .object({
    framework: FrameworkFilterSchema,
    kind: EntityKindFilterSchema,
    path: ProjectRelativePathSchema.optional(),
    scope: ProjectRelativePathSchema.optional(),
    includeRelations: QueryBooleanSchema,
    maxEntities: z.coerce.number().int().min(1).max(5_000).default(100),
    maxRelationships: z.coerce.number().int().min(1).max(10_000).default(200),
  })
  .strict();

export const ProjectFrameworkScopeSchema = z
  .object({
    id: z.string().uuid(),
    scopeKey: Sha256Schema,
    framework: ProjectFrameworkKindSchema,
    rootPath: ProjectRelativePathSchema,
    packageName: NullableBoundedTextSchema,
    contextHash: Sha256Schema,
  })
  .strict();

export const ProjectFrameworkEntitySchema = z
  .object({
    id: z.string().uuid(),
    scopeId: z.string().uuid(),
    sourceFileId: z.string().uuid(),
    identityKey: Sha256Schema,
    framework: ProjectFrameworkKindSchema,
    entityKind: ProjectFrameworkEntityKindSchema,
    name: BoundedTextSchema,
    path: ProjectRelativePathSchema,
    symbolId: z.string().uuid().nullable(),
    evidenceKind: ProjectFrameworkEvidenceKindSchema,
    certainty: ProjectFrameworkCertaintySchema,
    range: ProjectFrameworkSourceRangeSchema.nullable(),
    attributes: ProjectFrameworkEntityAttributesSchema,
  })
  .strict();

export const ProjectFrameworkRelationshipSchema = z
  .object({
    id: z.string().uuid(),
    scopeId: z.string().uuid(),
    sourceEntityId: z.string().uuid(),
    targetEntityId: z.string().uuid().nullable(),
    sourceFileId: z.string().uuid().nullable(),
    dependencyEdgeId: z.string().uuid().nullable(),
    symbolId: z.string().uuid().nullable(),
    identityKey: Sha256Schema,
    framework: ProjectFrameworkKindSchema,
    relationshipKind: ProjectFrameworkRelationshipKindSchema,
    targetName: NullableBoundedTextSchema,
    evidenceKind: ProjectFrameworkEvidenceKindSchema,
    certainty: ProjectFrameworkCertaintySchema,
    range: ProjectFrameworkSourceRangeSchema.nullable(),
    attributes: ProjectFrameworkRelationshipAttributesSchema,
  })
  .strict();

export const ProjectFrameworkCatalogResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    frameworkIndex: ProjectFrameworkIndexSchema,
    scopes: ProjectFrameworkScopeSchema.array().max(5_000),
    entities: ProjectFrameworkEntitySchema.array().max(5_000),
    relationships: ProjectFrameworkRelationshipSchema.array().max(10_000),
    truncated: z
      .object({
        entities: z.boolean(),
        relationships: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !value.relationships.every((relationship) =>
        value.entities.some((entity) => entity.id === relationship.sourceEntityId),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Framework relationships must originate from a returned entity.",
        path: ["relationships"],
      });
    }
    const scopeIds = new Set(value.scopes.map((scope) => scope.id));
    if (
      !value.entities.every((entity) => scopeIds.has(entity.scopeId)) ||
      !value.relationships.every((relationship) => scopeIds.has(relationship.scopeId))
    ) {
      context.addIssue({
        code: "custom",
        message: "Framework facts must reference a returned scope.",
        path: ["scopes"],
      });
    }
  });

export type ProjectFrameworkCatalogEntity = z.infer<typeof ProjectFrameworkEntitySchema>;
export type ProjectFrameworkCatalogQuery = z.infer<typeof ProjectFrameworkCatalogQuerySchema>;
export type ProjectFrameworkCatalogRelationship = z.infer<typeof ProjectFrameworkRelationshipSchema>;
export type ProjectFrameworkCatalogResponse = z.infer<typeof ProjectFrameworkCatalogResponseSchema>;
export type ProjectFrameworkCatalogScope = z.infer<typeof ProjectFrameworkScopeSchema>;
export type ProjectFrameworkCertainty = z.infer<typeof ProjectFrameworkCertaintySchema>;
export type ProjectFrameworkEntityAttributes = z.infer<typeof ProjectFrameworkEntityAttributesSchema>;
export type ProjectFrameworkEntityKind = z.infer<typeof ProjectFrameworkEntityKindSchema>;
export type ProjectFrameworkKind = z.infer<typeof ProjectFrameworkKindSchema>;
export type ProjectFrameworkRelationshipAttributes = z.infer<typeof ProjectFrameworkRelationshipAttributesSchema>;
export type ProjectFrameworkRelationshipKind = z.infer<typeof ProjectFrameworkRelationshipKindSchema>;

function commaSeparatedValues(value: unknown): unknown {
  if (value === undefined) return [];
  const values: readonly unknown[] = Array.isArray(value) ? (value as readonly unknown[]) : [value];
  return values.flatMap((item) => (typeof item === "string" ? item.split(",") : [item])).filter((item) => item !== "");
}

function orderedUnique<T extends string>(values: readonly T[], order: readonly T[]): T[] {
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}
