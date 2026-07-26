import type { Project, ProjectScan } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import { ProjectNotFoundError, ProjectScanFailedError } from "../domain/project.errors.js";
import type { ProjectIgnoreEvaluator } from "./project-ignore.evaluator.js";
import type { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import { ProjectInventoryService } from "./project-inventory.service.js";
import type { ProjectRepository } from "./project.repository.js";
import type { RepositoryInventoryWalker } from "./repository-inventory.walker.js";

const project: Project = {
  createdAt: "2026-07-27T08:00:00.000Z",
  id: "03f4c07e-e890-454d-b557-17b780906ceb",
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-27T08:00:00.000Z",
};

const runningScan: ProjectScan = {
  completedAt: null,
  errorCode: null,
  fileCount: 0,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 0,
  limitReasons: [],
  projectId: project.id,
  skippedSymlinkCount: 0,
  startedAt: "2026-07-27T09:00:00.000Z",
  status: "running",
  totalBytes: 0,
};

const completedScan: ProjectScan = {
  ...runningScan,
  completedAt: "2026-07-27T09:01:00.000Z",
  fileCount: 1,
  ignoredPathCount: 2,
  status: "completed",
  totalBytes: 12,
};

function createService(
  options: {
    readonly projectResult?: Project | null;
    readonly walkError?: Error;
    readonly completeError?: Error;
  } = {},
): {
  readonly service: ProjectInventoryService;
  readonly beginScan: ReturnType<typeof vi.fn>;
  readonly completeScan: ReturnType<typeof vi.fn>;
  readonly failScan: ReturnType<typeof vi.fn>;
  readonly getLatestScan: ReturnType<typeof vi.fn>;
  readonly recoverInterruptedScans: ReturnType<typeof vi.fn>;
  readonly walk: ReturnType<typeof vi.fn>;
} {
  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(options.projectResult === undefined ? project : options.projectResult)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const beginScan = vi.fn(() => Promise.resolve(runningScan));
  const completeScan = vi.fn(() =>
    options.completeError === undefined ? Promise.resolve(completedScan) : Promise.reject(options.completeError),
  );
  const failScan = vi.fn(() =>
    Promise.resolve({
      ...runningScan,
      completedAt: "2026-07-27T09:01:00.000Z",
      errorCode: "filesystem_error" as const,
      status: "failed" as const,
    }),
  );
  const getLatestScan = vi.fn(() => Promise.resolve(completedScan));
  const recoverInterruptedScans = vi.fn(() => Promise.resolve(0));
  const inventoryRepository = {
    beginScan,
    completeScan,
    failScan,
    getLatestScan,
    recoverInterruptedScans,
  } satisfies ProjectInventoryRepository;
  const walk = vi.fn(() =>
    options.walkError === undefined
      ? Promise.resolve({
          files: [
            {
              modifiedAt: "2026-07-27T08:30:00.000Z",
              path: "src/main.ts",
              sizeBytes: 12,
            },
          ],
          ignoredPathCount: 2,
          limitReasons: [],
          skippedSymlinkCount: 1,
          totalBytes: 12,
        })
      : Promise.reject(options.walkError),
  );
  const inventoryWalker = { walk } satisfies RepositoryInventoryWalker;
  const ignoreEvaluator = { check: vi.fn() } as unknown as ProjectIgnoreEvaluator;
  const ignorePolicy = {
    createEvaluator: vi.fn(() => ignoreEvaluator),
  } as unknown as ProjectIgnorePolicyService;
  const config = loadConfig({
    ARC_PROJECT_SCAN_BATCH_SIZE: "100",
    ARC_PROJECT_SCAN_MAX_DEPTH: "12",
    ARC_PROJECT_SCAN_MAX_FILES: "500",
    ARC_PROJECT_SCAN_MAX_TOTAL_BYTES: "1048576",
  });

  return {
    beginScan,
    completeScan,
    failScan,
    getLatestScan,
    recoverInterruptedScans,
    service: new ProjectInventoryService(projectRepository, inventoryRepository, inventoryWalker, ignorePolicy, config),
    walk,
  };
}

describe("ProjectInventoryService", () => {
  it("walks and atomically completes a bounded inventory scan", async () => {
    const { beginScan, completeScan, service, walk } = createService();

    await expect(service.scan(project.id)).resolves.toEqual(completedScan);
    expect(beginScan).toHaveBeenCalledWith(project.id);
    expect(walk).toHaveBeenCalledWith("/workspace/arc", expect.anything(), {
      maxDepth: 12,
      maxFiles: 500,
      maxTotalBytes: 1_048_576,
    });
    expect(completeScan).toHaveBeenCalledWith(
      expect.objectContaining({
        batchSize: 100,
        files: [expect.objectContaining({ path: "src/main.ts" })],
        projectId: project.id,
        scanId: runningScan.id,
      }),
    );
  });

  it("records filesystem failures without attempting inventory replacement", async () => {
    const { completeScan, failScan, service } = createService({ walkError: new Error("EACCES") });

    await expect(service.scan(project.id)).rejects.toBeInstanceOf(ProjectScanFailedError);
    expect(completeScan).not.toHaveBeenCalled();
    expect(failScan).toHaveBeenCalledWith({
      errorCode: "filesystem_error",
      projectId: project.id,
      scanId: runningScan.id,
    });
  });

  it("records persistence failures after a successful walk", async () => {
    const { failScan, service } = createService({ completeError: new Error("database unavailable") });

    await expect(service.scan(project.id)).rejects.toBeInstanceOf(ProjectScanFailedError);
    expect(failScan).toHaveBeenCalledWith({
      errorCode: "inventory_persistence_error",
      projectId: project.id,
      scanId: runningScan.id,
    });
  });

  it("returns latest status and rejects unknown projects before creating a scan", async () => {
    const { getLatestScan, service } = createService();

    await expect(service.getLatestScan(project.id)).resolves.toEqual({ scan: completedScan });
    expect(getLatestScan).toHaveBeenCalledWith(project.id);

    const unknown = createService({ projectResult: null });
    await expect(unknown.service.scan(project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(unknown.beginScan).not.toHaveBeenCalled();
  });

  it("recovers interrupted scans without preventing backend startup", async () => {
    const recovered = createService();
    recovered.recoverInterruptedScans.mockResolvedValueOnce(2);

    await expect(recovered.service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(recovered.recoverInterruptedScans).toHaveBeenCalledOnce();

    recovered.recoverInterruptedScans.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(recovered.service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
