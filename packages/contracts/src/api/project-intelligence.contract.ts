import { z } from "zod";

import { ProjectRelativePathSchema } from "./project-ignore.contract.js";
import { ProjectIdSchema } from "./project.contract.js";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const BoundedTextSchema = z.string().min(1).max(512);

export const ProjectIntelligenceKindSchema = z.enum([
  "call",
  "reference",
  "extends",
  "implements",
  "sequelize_association",
  "postgres_foreign_key",
  "mongoose_reference",
  "job",
  "queue",
  "worker",
  "cron",
  "etl",
  "graphql",
  "rest_client",
  "configuration",
  "environment",
  "document",
]);

const IntelligenceKindFilterSchema = z.preprocess(
  commaSeparatedValues,
  ProjectIntelligenceKindSchema.array()
    .max(ProjectIntelligenceKindSchema.options.length)
    .default([])
    .transform((values) => orderedUnique(values, ProjectIntelligenceKindSchema.options)),
);

export const ProjectIntelligenceCatalogQuerySchema = z
  .object({
    kinds: IntelligenceKindFilterSchema,
    maxRecords: z.coerce.number().int().min(1).max(500).default(200),
    pathPrefix: ProjectRelativePathSchema.optional(),
  })
  .strict();

export const ProjectIntelligenceSourceRangeSchema = z
  .object({
    endByte: z.number().int().nonnegative(),
    endColumnByte: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(),
    startByte: z.number().int().nonnegative(),
    startColumnByte: z.number().int().nonnegative(),
    startLine: z.number().int().nonnegative(),
  })
  .strict()
  .refine((range) => range.endByte >= range.startByte && range.endLine >= range.startLine, {
    message: "Project intelligence source ranges must be ordered.",
  });

export const ProjectIntelligenceDetailSchema = z.object({ key: BoundedTextSchema, value: BoundedTextSchema }).strict();

export const ProjectIntelligenceTargetSchema = z
  .object({
    name: BoundedTextSchema,
    path: ProjectRelativePathSchema.nullable(),
    sourceFileId: z.string().uuid().nullable(),
    symbolId: z.string().uuid().nullable(),
  })
  .strict();

export const ProjectIntelligenceRecordSchema = z
  .object({
    details: ProjectIntelligenceDetailSchema.array().max(10),
    evidence: BoundedTextSchema,
    id: Sha256Schema,
    kind: ProjectIntelligenceKindSchema,
    name: BoundedTextSchema,
    path: ProjectRelativePathSchema,
    range: ProjectIntelligenceSourceRangeSchema,
    sourceFileId: z.string().uuid(),
    target: ProjectIntelligenceTargetSchema.nullable(),
  })
  .strict();

export const ProjectIntelligenceCatalogResponseSchema = z
  .object({
    dependencyIndexRunId: z.string().uuid(),
    frameworkIndexRunId: z.string().uuid().nullable(),
    projectId: ProjectIdSchema,
    records: ProjectIntelligenceRecordSchema.array().max(500),
    sourceIndexRunId: z.string().uuid(),
    symbolIndexRunId: z.string().uuid(),
    truncated: z
      .object({
        files: z.boolean(),
        records: z.boolean(),
        symbols: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type ProjectIntelligenceCatalogQuery = z.infer<typeof ProjectIntelligenceCatalogQuerySchema>;
export type ProjectIntelligenceCatalogResponse = z.infer<typeof ProjectIntelligenceCatalogResponseSchema>;
export type ProjectIntelligenceDetail = z.infer<typeof ProjectIntelligenceDetailSchema>;
export type ProjectIntelligenceKind = z.infer<typeof ProjectIntelligenceKindSchema>;
export type ProjectIntelligenceRecord = z.infer<typeof ProjectIntelligenceRecordSchema>;
export type ProjectIntelligenceSourceRange = z.infer<typeof ProjectIntelligenceSourceRangeSchema>;

function commaSeparatedValues(value: unknown): unknown {
  if (value === undefined) return [];
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => (typeof item === "string" ? item.split(",") : [item])).filter((item) => item !== "");
}

function orderedUnique<T extends string>(values: readonly T[], order: readonly T[]): T[] {
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}
