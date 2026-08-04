import { describe, expect, it } from "vitest";

import {
  LatestProjectDependencyIndexResponseSchema,
  ProjectDependencyFileErrorCodeSchema,
  ProjectDependencyIndexSchema,
} from "./project-dependency-index.contract.js";

const completedRun = {
  bindingCount: 8,
  builtinEdgeCount: 1,
  completedAt: "2026-07-28T12:01:00.000Z",
  edgeCount: 6,
  errorCode: null,
  externalEdgeCount: 1,
  failedFileCount: 1,
  id: "76e5ee0b-608d-4792-91c5-fd46579e74e4",
  limitReasons: [],
  localEdgeCount: 3,
  omittedBindingCount: 2,
  omittedEdgeCount: 1,
  parsedFileCount: 4,
  projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
  resolutionContextHash: "a".repeat(64),
  resolverWarnings: ["config_missing"],
  reusedFileCount: 2,
  sourceIndexRunId: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  startedAt: "2026-07-28T12:00:00.000Z",
  status: "completed",
  unresolvedEdgeCount: 1,
  unsupportedFileCount: 3,
};

describe("project dependency index contracts", () => {
  it("accepts a completed run and independent catalog freshness", () => {
    expect(ProjectDependencyIndexSchema.parse(completedRun)).toEqual(completedRun);
    expect(
      LatestProjectDependencyIndexResponseSchema.parse({
        currentCatalog: {
          bindingCount: completedRun.bindingCount,
          builtinEdgeCount: completedRun.builtinEdgeCount,
          completedAt: completedRun.completedAt,
          dependencyIndexId: completedRun.id,
          edgeCount: completedRun.edgeCount,
          externalEdgeCount: completedRun.externalEdgeCount,
          failedFileCount: completedRun.failedFileCount,
          localEdgeCount: completedRun.localEdgeCount,
          limitReasons: completedRun.limitReasons,
          omittedBindingCount: completedRun.omittedBindingCount,
          omittedEdgeCount: completedRun.omittedEdgeCount,
          parsedFileCount: completedRun.parsedFileCount,
          resolutionContextHash: completedRun.resolutionContextHash,
          resolverWarnings: completedRun.resolverWarnings,
          reusedFileCount: completedRun.reusedFileCount,
          sourceIndexRunId: completedRun.sourceIndexRunId,
          stale: true,
          unresolvedEdgeCount: completedRun.unresolvedEdgeCount,
          unsupportedFileCount: completedRun.unsupportedFileCount,
        },
        latestRun: completedRun,
      }).currentCatalog,
    ).toMatchObject({ stale: true });
  });

  it("rejects unknown errors, missing publication context, and inconsistent edge counts", () => {
    expect(ProjectDependencyFileErrorCodeSchema.safeParse("raw_parser_message").success).toBe(false);
    expect(
      ProjectDependencyIndexSchema.safeParse({
        ...completedRun,
        resolutionContextHash: null,
      }).success,
    ).toBe(false);
    expect(
      ProjectDependencyIndexSchema.safeParse({
        ...completedRun,
        localEdgeCount: 2,
      }).success,
    ).toBe(false);
  });
});
