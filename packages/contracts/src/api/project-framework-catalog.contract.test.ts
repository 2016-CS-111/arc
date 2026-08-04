import { describe, expect, it } from "vitest";

import {
  ProjectFrameworkCatalogQuerySchema,
  ProjectFrameworkCatalogResponseSchema,
} from "./project-framework-catalog.contract.js";

const frameworkIndex = {
  analyzedFileCount: 1,
  analyzerSetIdentity: "a".repeat(64),
  completedAt: "2026-07-29T12:01:00.000Z",
  dependencyIndexRunId: "76e5ee0b-608d-4792-91c5-fd46579e74e4",
  entityCount: 1,
  errorCode: null,
  failedFileCount: 0,
  id: "00000000-0000-4000-8000-000000000001",
  limitReasons: [],
  omissionCount: 0,
  projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
  relationshipCount: 1,
  reusedFileCount: 0,
  scopeCount: 1,
  sourceIndexRunId: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  startedAt: "2026-07-29T12:00:00.000Z",
  status: "completed",
  symbolIndexRunId: "bfcd6c71-f627-45cb-b133-65cf2e129f13",
  unresolvedRelationshipCount: 1,
  unsupportedFileCount: 0,
  warnings: [],
} as const;

const scope = {
  contextHash: "b".repeat(64),
  framework: "express",
  id: "b4bf0c2a-9d50-4569-906f-7cfa2798f91e",
  packageName: "arc-api",
  rootPath: ".",
  scopeKey: "c".repeat(64),
} as const;

const entity = {
  attributes: { kind: "express_application", localName: "app" },
  certainty: "declared",
  entityKind: "application",
  evidenceKind: "call_expression",
  framework: "express",
  id: "90719f02-3837-44d6-a685-20046ed7f3f5",
  identityKey: "d".repeat(64),
  name: "app",
  path: "src/main.ts",
  range: null,
  scopeId: scope.id,
  sourceFileId: "83107b40-6495-455f-a557-b64b29ef6af1",
  symbolId: null,
} as const;

describe("ProjectFrameworkCatalogQuerySchema", () => {
  it("normalizes repeated and comma-separated filters with bounded defaults", () => {
    expect(
      ProjectFrameworkCatalogQuerySchema.parse({
        framework: ["sequelize,express", "express"],
        includeRelations: "true",
        kind: "model,application",
      }),
    ).toEqual({
      framework: ["express", "sequelize"],
      includeRelations: true,
      kind: ["application", "model"],
      maxEntities: 100,
      maxRelationships: 200,
    });
  });

  it("rejects unknown filters, invalid booleans, and unbounded requests", () => {
    expect(ProjectFrameworkCatalogQuerySchema.safeParse({ framework: "mongoose" }).success).toBe(false);
    expect(ProjectFrameworkCatalogQuerySchema.safeParse({ includeRelations: "yes" }).success).toBe(false);
    expect(ProjectFrameworkCatalogQuerySchema.safeParse({ maxEntities: 5_001 }).success).toBe(false);
    expect(ProjectFrameworkCatalogQuerySchema.safeParse({ unexpected: "value" }).success).toBe(false);
  });
});

describe("ProjectFrameworkCatalogResponseSchema", () => {
  it("accepts bounded static facts with opaque provenance", () => {
    const response = {
      entities: [entity],
      frameworkIndex,
      projectId: frameworkIndex.projectId,
      relationships: [
        {
          attributes: { dynamicPath: false, kind: "express_router_mount", paths: ["/api"] },
          certainty: "unresolved",
          dependencyEdgeId: null,
          evidenceKind: "call_expression",
          framework: "express",
          id: "22c451b8-f08a-4fef-8190-784ee927104c",
          identityKey: "e".repeat(64),
          range: null,
          relationshipKind: "mounts_router",
          scopeId: scope.id,
          sourceEntityId: entity.id,
          sourceFileId: entity.sourceFileId,
          symbolId: null,
          targetEntityId: null,
          targetName: "apiRouter",
        },
      ],
      scopes: [scope],
      truncated: { entities: false, relationships: false },
    };

    expect(ProjectFrameworkCatalogResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects source bodies, arbitrary attributes, and orphaned relationships", () => {
    expect(
      ProjectFrameworkCatalogResponseSchema.safeParse({
        entities: [{ ...entity, attributes: { ...entity.attributes, source: "secret" } }],
        frameworkIndex,
        projectId: frameworkIndex.projectId,
        relationships: [],
        scopes: [scope],
        truncated: { entities: false, relationships: false },
      }).success,
    ).toBe(false);
    expect(
      ProjectFrameworkCatalogResponseSchema.safeParse({
        entities: [],
        frameworkIndex,
        projectId: frameworkIndex.projectId,
        relationships: [
          {
            attributes: { kind: "next_component_ownership" },
            certainty: "linked",
            dependencyEdgeId: null,
            evidenceKind: "catalog_link",
            framework: "nextjs",
            id: "22c451b8-f08a-4fef-8190-784ee927104c",
            identityKey: "e".repeat(64),
            range: null,
            relationshipKind: "contains",
            scopeId: scope.id,
            sourceEntityId: entity.id,
            sourceFileId: entity.sourceFileId,
            symbolId: null,
            targetEntityId: null,
            targetName: null,
          },
        ],
        scopes: [scope],
        truncated: { entities: false, relationships: false },
      }).success,
    ).toBe(false);
  });
});
