import { describe, expect, it } from "vitest";

import {
  LatestProjectSymbolIndexResponseSchema,
  ProjectSymbolFileErrorCodeSchema,
  ProjectSymbolIndexSchema,
} from "./project-symbol-index.contract.js";

const completedRun = {
  completedAt: "2026-07-27T12:01:00.000Z",
  errorCode: null,
  failedFileCount: 1,
  id: "bfcd6c71-f627-45cb-b133-65cf2e129f13",
  limitReasons: [],
  omittedSymbolCount: 0,
  parsedFileCount: 4,
  projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
  reusedFileCount: 2,
  sourceIndexRunId: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  startedAt: "2026-07-27T12:00:00.000Z",
  status: "completed",
  symbolCount: 27,
  unsupportedFileCount: 3,
};

describe("project symbol index contracts", () => {
  it("accepts a completed run and independent catalog freshness", () => {
    expect(ProjectSymbolIndexSchema.parse(completedRun)).toEqual(completedRun);
    expect(
      LatestProjectSymbolIndexResponseSchema.parse({
        currentCatalog: {
          completedAt: completedRun.completedAt,
          failedFileCount: completedRun.failedFileCount,
          omittedSymbolCount: completedRun.omittedSymbolCount,
          parsedFileCount: completedRun.parsedFileCount,
          reusedFileCount: completedRun.reusedFileCount,
          sourceIndexRunId: completedRun.sourceIndexRunId,
          stale: true,
          symbolCount: completedRun.symbolCount,
          symbolIndexId: completedRun.id,
          unsupportedFileCount: completedRun.unsupportedFileCount,
        },
        latestRun: completedRun,
      }).currentCatalog,
    ).toMatchObject({ stale: true });
  });

  it("rejects unknown file errors and invalid terminal state", () => {
    expect(ProjectSymbolFileErrorCodeSchema.safeParse("raw_parser_message").success).toBe(false);
    expect(
      ProjectSymbolIndexSchema.safeParse({
        ...completedRun,
        completedAt: null,
      }).success,
    ).toBe(false);
  });
});
