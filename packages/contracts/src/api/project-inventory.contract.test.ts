import { describe, expect, it } from "vitest";

import {
  LatestProjectScanResponseSchema,
  ProjectFileMetadataSchema,
  ProjectScanSchema,
} from "./project-inventory.contract.js";

const scan = {
  completedAt: "2026-07-27T09:01:00.000Z",
  errorCode: null,
  fileCount: 42,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 8,
  limitReasons: [],
  projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
  skippedSymlinkCount: 1,
  startedAt: "2026-07-27T09:00:00.000Z",
  status: "completed",
  totalBytes: 1024,
};

describe("project inventory contracts", () => {
  it("validates metadata-only file entries", () => {
    expect(
      ProjectFileMetadataSchema.parse({
        modifiedAt: "2026-07-27T09:00:00.000Z",
        path: "packages/api/src/main.ts",
        sizeBytes: 512,
      }),
    ).toMatchObject({ path: "packages/api/src/main.ts", sizeBytes: 512 });
  });

  it("validates completed and limited scan summaries", () => {
    expect(ProjectScanSchema.parse(scan)).toEqual(scan);
    expect(
      ProjectScanSchema.parse({
        ...scan,
        limitReasons: ["file_count", "depth"],
        status: "limited",
      }),
    ).toMatchObject({ limitReasons: ["file_count", "depth"], status: "limited" });
  });

  it("allows a project with no scan history", () => {
    expect(LatestProjectScanResponseSchema.parse({ scan: null })).toEqual({ scan: null });
  });
});
