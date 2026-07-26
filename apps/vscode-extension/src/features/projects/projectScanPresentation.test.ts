import type { ProjectScan } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { createProjectScanPresentation } from "./projectScanPresentation.js";

const scan: ProjectScan = {
  completedAt: "2026-07-27T09:01:00.000Z",
  errorCode: null,
  fileCount: 203,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 17,
  limitReasons: [],
  projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
  skippedSymlinkCount: 0,
  startedAt: "2026-07-27T09:00:00.000Z",
  status: "completed",
  totalBytes: 673_770,
};

describe("createProjectScanPresentation", () => {
  it("presents absent, running, and completed inventories", () => {
    expect(createProjectScanPresentation(null)).toMatchObject({ text: "$(database) Arc: Not scanned" });
    expect(createProjectScanPresentation({ ...scan, completedAt: null, status: "running" })).toMatchObject({
      text: "$(sync~spin) Arc: Scanning",
    });
    expect(createProjectScanPresentation(scan)).toMatchObject({
      background: null,
      completionMessage: "Arc inventoried 203 files.",
      text: "$(database) Arc: 203 files",
    });
  });

  it("distinguishes limited and restart-interrupted scans", () => {
    expect(
      createProjectScanPresentation({
        ...scan,
        limitReasons: ["file_count"],
        status: "limited",
      }),
    ).toMatchObject({
      background: "warning",
      text: "$(warning) Arc: 203 files",
    });
    const interrupted = createProjectScanPresentation({
      ...scan,
      errorCode: "scan_interrupted",
      fileCount: 0,
      status: "failed",
      totalBytes: 0,
    });
    expect(interrupted).toMatchObject({
      background: "error",
      text: "$(error) Arc: Scan failed",
    });
    expect(interrupted.tooltip).toContain("backend restart");
  });
});
