import { describe, expect, it } from "vitest";
import {
  LatestProjectFrameworkIndexResponseSchema,
  ProjectFrameworkIndexSchema,
} from "./project-framework-index.contract.js";

const run = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  sourceIndexRunId: "33333333-3333-4333-8333-333333333333",
  symbolIndexRunId: "44444444-4444-4444-8444-444444444444",
  dependencyIndexRunId: "55555555-5555-4555-8555-555555555555",
  status: "completed",
  analyzerSetIdentity: "a".repeat(64),
  scopeCount: 2,
  analyzedFileCount: 3,
  reusedFileCount: 0,
  unsupportedFileCount: 1,
  failedFileCount: 0,
  entityCount: 4,
  relationshipCount: 2,
  unresolvedRelationshipCount: 1,
  omissionCount: 1,
  limitReasons: [],
  warnings: [],
  errorCode: null,
  startedAt: "2026-07-29T00:00:00.000Z",
  completedAt: "2026-07-29T00:00:01.000Z",
} as const;

describe("ProjectFrameworkIndexSchema", () => {
  it("accepts a bounded durable framework run and latest response", () => {
    expect(ProjectFrameworkIndexSchema.parse(run)).toEqual(run);
    expect(
      LatestProjectFrameworkIndexResponseSchema.parse({
        latestRun: run,
        currentCatalog: { ...run, stale: false },
      }),
    ).toEqual({
      latestRun: run,
      currentCatalog: { ...run, stale: false },
    });
  });

  it("rejects unversioned analyzer identities and unknown errors", () => {
    expect(ProjectFrameworkIndexSchema.safeParse({ ...run, analyzerSetIdentity: "bad" }).success).toBe(false);
    expect(ProjectFrameworkIndexSchema.safeParse({ ...run, status: "failed", errorCode: "secret_error" }).success).toBe(
      false,
    );
  });

  it("enforces terminal, error, limit, and relationship-count invariants", () => {
    expect(ProjectFrameworkIndexSchema.safeParse({ ...run, completedAt: null }).success).toBe(false);
    expect(ProjectFrameworkIndexSchema.safeParse({ ...run, errorCode: "index_interrupted" }).success).toBe(false);
    expect(ProjectFrameworkIndexSchema.safeParse({ ...run, limitReasons: ["total_entities"] }).success).toBe(false);
    expect(ProjectFrameworkIndexSchema.safeParse({ ...run, unresolvedRelationshipCount: 3 }).success).toBe(false);
  });
});
