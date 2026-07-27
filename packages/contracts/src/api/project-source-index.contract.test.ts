import { describe, expect, it } from "vitest";

import {
  LatestProjectSourceIndexResponseSchema,
  ProjectSourceFileSkipReasonSchema,
  ProjectSourceIndexSchema,
} from "./project-source-index.contract.js";

const completedRun = {
  completedAt: "2026-07-27T10:01:00.000Z",
  errorCode: null,
  id: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  inspectedBytes: 2048,
  inventoryScanId: "72449150-b7e9-4410-8502-10e221dcdf43",
  limitReasons: [],
  projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
  readyBytes: 1536,
  readyFileCount: 3,
  skippedFileCount: 2,
  startedAt: "2026-07-27T10:00:00.000Z",
  status: "completed",
};

describe("project source index contracts", () => {
  it("validates source index run summaries", () => {
    expect(ProjectSourceIndexSchema.parse(completedRun)).toEqual(completedRun);
    expect(
      ProjectSourceIndexSchema.parse({
        ...completedRun,
        limitReasons: ["total_bytes"],
        status: "limited",
      }),
    ).toMatchObject({ limitReasons: ["total_bytes"], status: "limited" });
  });

  it("validates stable source-file skip reasons", () => {
    expect(ProjectSourceFileSkipReasonSchema.parse("binary_content")).toBe("binary_content");
    expect(ProjectSourceFileSkipReasonSchema.safeParse("probably_binary").success).toBe(false);
  });

  it("represents latest run and current catalog independently", () => {
    expect(
      LatestProjectSourceIndexResponseSchema.parse({
        currentCatalog: {
          completedAt: completedRun.completedAt,
          inspectedBytes: completedRun.inspectedBytes,
          inventoryScanId: completedRun.inventoryScanId,
          readyBytes: completedRun.readyBytes,
          readyFileCount: completedRun.readyFileCount,
          skippedFileCount: completedRun.skippedFileCount,
          sourceIndexId: completedRun.id,
          stale: true,
        },
        latestRun: {
          ...completedRun,
          errorCode: "index_interrupted",
          status: "failed",
        },
      }),
    ).toMatchObject({
      currentCatalog: { stale: true },
      latestRun: { status: "failed" },
    });
  });
});
