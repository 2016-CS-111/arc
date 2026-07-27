import type {
  CheckProjectPathRequest,
  Project,
  ProjectIgnoreDecision,
  ProjectScan,
  ProjectSourceIndex,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import {
  ProjectInventoryRequiredError,
  ProjectNotFoundError,
  ProjectSourceIndexFailedError,
} from "../domain/project.errors.js";
import type {
  CompleteProjectSourceIndexInput,
  SourceTextReadInput,
  SourceTextReadResult,
} from "../domain/project-source-index.types.js";
import type { ProjectIgnoreEvaluator } from "./project-ignore.evaluator.js";
import type { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import { ProjectSourceIndexService } from "./project-source-index.service.js";
import { SourceLanguageClassifier } from "./source-language.classifier.js";
import type { SourceTextReader } from "./source-text.reader.js";

const project: Project = {
  createdAt: "2026-07-27T08:00:00.000Z",
  id: "03f4c07e-e890-454d-b557-17b780906ceb",
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-27T08:00:00.000Z",
};

const inventoryScan: ProjectScan = {
  completedAt: "2026-07-27T09:01:00.000Z",
  errorCode: null,
  fileCount: 2,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 0,
  limitReasons: [],
  projectId: project.id,
  skippedSymlinkCount: 0,
  startedAt: "2026-07-27T09:00:00.000Z",
  status: "completed",
  totalBytes: 10,
};

const runningIndex: ProjectSourceIndex = {
  completedAt: null,
  errorCode: null,
  id: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  inspectedBytes: 0,
  inventoryScanId: inventoryScan.id,
  limitReasons: [],
  projectId: project.id,
  readyBytes: 0,
  readyFileCount: 0,
  skippedFileCount: 0,
  startedAt: "2026-07-27T10:00:00.000Z",
  status: "running",
};

const completedIndex: ProjectSourceIndex = {
  ...runningIndex,
  completedAt: "2026-07-27T10:01:00.000Z",
  inspectedBytes: 5,
  readyBytes: 5,
  readyFileCount: 1,
  skippedFileCount: 1,
  status: "completed",
};

function createService(
  options: {
    readonly completeError?: Error;
    readonly ignoreError?: Error;
    readonly inventory?: boolean;
    readonly projectResult?: Project | null;
  } = {},
) {
  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(options.projectResult === undefined ? project : options.projectResult)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const getCurrentSnapshot = vi.fn(() =>
    Promise.resolve(
      options.inventory === false
        ? null
        : {
            files: [
              {
                modifiedAt: "2026-07-27T08:30:00.000Z",
                path: "src/main.ts",
                sizeBytes: 5,
              },
              {
                modifiedAt: "2026-07-27T08:30:00.000Z",
                path: "notes.txt",
                sizeBytes: 5,
              },
            ],
            scan: inventoryScan,
          },
    ),
  );
  const inventoryRepository = {
    beginScan: vi.fn(),
    completeScan: vi.fn(),
    failScan: vi.fn(),
    getCurrentSnapshot,
    getLatestScan: vi.fn(),
    recoverInterruptedScans: vi.fn(),
  } satisfies ProjectInventoryRepository;
  const beginIndex = vi.fn(() => Promise.resolve(runningIndex));
  const completeIndex = vi.fn((input: CompleteProjectSourceIndexInput): Promise<ProjectSourceIndex> =>
    options.completeError === undefined
      ? Promise.resolve({
          ...completedIndex,
          inspectedBytes: input.inspectedBytes,
          limitReasons: input.limitReasons,
          readyBytes: input.readyBytes,
          readyFileCount: input.readyFileCount,
          skippedFileCount: input.skippedFileCount,
          status: input.limitReasons.length === 0 ? "completed" : "limited",
        })
      : Promise.reject(options.completeError),
  );
  const failIndex = vi.fn(() =>
    Promise.resolve({
      ...runningIndex,
      completedAt: "2026-07-27T10:01:00.000Z",
      errorCode: "filesystem_error" as const,
      status: "failed" as const,
    }),
  );
  const getCurrentCatalogRun = vi.fn(() => Promise.resolve(completedIndex));
  const getLatestRun = vi.fn(() => Promise.resolve(completedIndex));
  const recoverInterruptedIndexes = vi.fn(() => Promise.resolve(0));
  const sourceIndexRepository = {
    beginIndex,
    completeIndex,
    failIndex,
    getCurrentCatalogRun,
    getLatestRun,
    recoverInterruptedIndexes,
  } satisfies ProjectSourceIndexRepository;
  const check = vi.fn((request: CheckProjectPathRequest): Promise<ProjectIgnoreDecision> => {
    const { path } = request;
    if (options.ignoreError !== undefined) {
      return Promise.reject(options.ignoreError);
    }
    return Promise.resolve({
      ignored: path === "notes.txt",
      kind: "file" as const,
      path,
      projectId: project.id,
      reason: {
        pattern: path === "notes.txt" ? "notes.txt" : null,
        source: path === "notes.txt" ? ("gitignore" as const) : ("none" as const),
        sourcePath: path === "notes.txt" ? ".gitignore" : null,
      },
    });
  });
  const ignoreEvaluator: ProjectIgnoreEvaluator = { check };
  const ignorePolicy = {
    createEvaluator: vi.fn(() => ignoreEvaluator),
  } as unknown as ProjectIgnorePolicyService;
  const inspect = vi.fn(({ file }: SourceTextReadInput): Promise<SourceTextReadResult> =>
    Promise.resolve({
      content: "hello",
      contentHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      inspectedBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      sizeBytes: file.sizeBytes,
      status: "ready" as const,
    }),
  );
  const sourceTextReader = { inspect } satisfies SourceTextReader;
  const config = loadConfig({
    ARC_PROJECT_SOURCE_BATCH_SIZE: "2",
    ARC_PROJECT_SOURCE_MAX_FILE_BYTES: "10",
    ARC_PROJECT_SOURCE_MAX_TOTAL_BYTES: "10",
  });
  const service = new ProjectSourceIndexService(
    projectRepository,
    inventoryRepository,
    sourceIndexRepository,
    sourceTextReader,
    ignorePolicy,
    new SourceLanguageClassifier(),
    config,
  );

  return {
    beginIndex,
    check,
    completeIndex,
    failIndex,
    getCurrentCatalogRun,
    getCurrentSnapshot,
    getLatestRun,
    inspect,
    recoverInterruptedIndexes,
    service,
  };
}

describe("ProjectSourceIndexService", () => {
  it("rechecks ignore rules, fingerprints eligible text, and discards content before persistence", async () => {
    const { completeIndex, inspect, service } = createService();

    await expect(service.index(project.id)).resolves.toMatchObject({
      readyFileCount: 1,
      skippedFileCount: 1,
      status: "completed",
    });
    expect(inspect).toHaveBeenCalledOnce();
    expect(completeIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        batchSize: 2,
        files: [
          expect.objectContaining({
            contentHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
            language: "typescript",
            relativePath: "src/main.ts",
            status: "ready",
          }),
          expect.objectContaining({
            relativePath: "notes.txt",
            skipReason: "ignored_since_scan",
            status: "skipped",
          }),
        ],
        inventoryScanId: inventoryScan.id,
      }),
    );
    expect(completeIndex.mock.calls[0]?.[0].files[0]).not.toHaveProperty("content");
  });

  it("stops before exceeding the aggregate byte budget", async () => {
    const fixture = createService();
    fixture.getCurrentSnapshot.mockResolvedValueOnce({
      files: [
        { modifiedAt: "2026-07-27T08:30:00.000Z", path: "a.ts", sizeBytes: 8 },
        { modifiedAt: "2026-07-27T08:30:00.000Z", path: "b.ts", sizeBytes: 5 },
      ],
      scan: inventoryScan,
    });

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      limitReasons: ["total_bytes"],
      readyFileCount: 1,
      skippedFileCount: 1,
      status: "limited",
    });
    expect(fixture.inspect).toHaveBeenCalledOnce();
    expect(fixture.completeIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({ relativePath: "a.ts", status: "ready" }),
          expect.objectContaining({ relativePath: "b.ts", skipReason: "run_limit" }),
        ],
      }),
    );
  });

  it("requires a registered project and a usable inventory", async () => {
    const unknown = createService({ projectResult: null });
    await expect(unknown.service.index(project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(unknown.beginIndex).not.toHaveBeenCalled();

    const missingInventory = createService({ inventory: false });
    await expect(missingInventory.service.index(project.id)).rejects.toBeInstanceOf(ProjectInventoryRequiredError);
    expect(missingInventory.beginIndex).not.toHaveBeenCalled();
  });

  it("records filesystem and persistence failures without publishing partial results", async () => {
    const filesystem = createService({ ignoreError: new Error("ignore file unavailable") });
    await expect(filesystem.service.index(project.id)).rejects.toBeInstanceOf(ProjectSourceIndexFailedError);
    expect(filesystem.failIndex).toHaveBeenCalledWith({
      errorCode: "filesystem_error",
      projectId: project.id,
      sourceIndexId: runningIndex.id,
    });
    expect(filesystem.completeIndex).not.toHaveBeenCalled();

    const persistence = createService({ completeError: new Error("database unavailable") });
    await expect(persistence.service.index(project.id)).rejects.toBeInstanceOf(ProjectSourceIndexFailedError);
    expect(persistence.failIndex).toHaveBeenCalledWith({
      errorCode: "source_persistence_error",
      projectId: project.id,
      sourceIndexId: runningIndex.id,
    });
  });

  it("reports current catalog freshness independently from the latest run", async () => {
    const fixture = createService();
    fixture.getCurrentSnapshot.mockResolvedValueOnce({
      files: [],
      scan: { ...inventoryScan, id: "70278861-e539-4419-a433-d0305dcac60f" },
    });
    fixture.getLatestRun.mockResolvedValueOnce({
      ...runningIndex,
      completedAt: "2026-07-27T10:02:00.000Z",
      errorCode: "index_interrupted",
      status: "failed",
    });

    await expect(fixture.service.getLatest(project.id)).resolves.toMatchObject({
      currentCatalog: {
        sourceIndexId: completedIndex.id,
        stale: true,
      },
      latestRun: {
        errorCode: "index_interrupted",
        status: "failed",
      },
    });
  });

  it("recovers interrupted indexes without preventing backend startup", async () => {
    const fixture = createService();
    fixture.recoverInterruptedIndexes.mockResolvedValueOnce(2);

    await expect(fixture.service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(fixture.recoverInterruptedIndexes).toHaveBeenCalledOnce();

    fixture.recoverInterruptedIndexes.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(fixture.service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
