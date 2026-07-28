import type { ProjectScan, ProjectSourceIndex, ProjectSymbolIndex, RegisterProjectResponse } from "@arc/contracts";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ProjectIgnorePolicyService } from "../application/project-ignore-policy.service.js";
import type { ProjectInventoryService } from "../application/project-inventory.service.js";
import type { ProjectRegistrationService } from "../application/project-registration.service.js";
import type { ProjectSourceIndexService } from "../application/project-source-index.service.js";
import type { ProjectSymbolIndexService } from "../application/project-symbol-index.service.js";
import {
  IgnoreRulesFileTooLargeError,
  InvalidProjectPathError,
  InvalidProjectRootError,
  ProjectNotFoundError,
  ProjectInventoryRequiredError,
  ProjectScanAlreadyRunningError,
  ProjectScanFailedError,
  ProjectSourceIndexAlreadyRunningError,
  ProjectSourceIndexFailedError,
  ProjectSourceCatalogRequiredError,
  ProjectSourceCatalogStaleError,
  ProjectSymbolIndexAlreadyRunningError,
  ProjectSymbolIndexFailedError,
} from "../domain/project.errors.js";
import { ProjectsController } from "./projects.controller.js";

const registration: RegisterProjectResponse = {
  created: true,
  project: {
    id: "03f4c07e-e890-454d-b557-17b780906ceb",
    name: "Arc",
    rootPath: "/workspace/arc",
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T08:00:00.000Z",
  },
};

const completedScan: ProjectScan = {
  completedAt: "2026-07-27T09:01:00.000Z",
  errorCode: null,
  fileCount: 42,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 8,
  limitReasons: [],
  projectId: registration.project.id,
  skippedSymlinkCount: 1,
  startedAt: "2026-07-27T09:00:00.000Z",
  status: "completed",
  totalBytes: 1024,
};

const completedSourceIndex: ProjectSourceIndex = {
  completedAt: "2026-07-27T10:01:00.000Z",
  errorCode: null,
  id: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  inspectedBytes: 1024,
  inventoryScanId: completedScan.id,
  limitReasons: [],
  projectId: registration.project.id,
  readyBytes: 900,
  readyFileCount: 10,
  skippedFileCount: 2,
  startedAt: "2026-07-27T10:00:00.000Z",
  status: "completed",
};

const completedSymbolIndex: ProjectSymbolIndex = {
  completedAt: "2026-07-27T11:01:00.000Z",
  errorCode: null,
  failedFileCount: 0,
  id: "bfcd6c71-f627-45cb-b133-65cf2e129f13",
  limitReasons: [],
  omittedSymbolCount: 0,
  parsedFileCount: 8,
  projectId: registration.project.id,
  reusedFileCount: 2,
  sourceIndexRunId: completedSourceIndex.id,
  startedAt: "2026-07-27T11:00:00.000Z",
  status: "completed",
  symbolCount: 42,
  unsupportedFileCount: 1,
};

describe("ProjectsController", () => {
  it("validates and normalizes registration input before delegating", async () => {
    const register = vi.fn(() => Promise.resolve(registration));
    const controller = createController(register);

    await expect(controller.register({ name: "  Arc  ", rootPath: "/workspace/arc" })).resolves.toEqual(registration);
    expect(register).toHaveBeenCalledWith({
      name: "Arc",
      rootPath: "/workspace/arc",
    });
  });

  it("returns stable bad-request errors for invalid payloads and roots", async () => {
    const register = vi.fn(() => Promise.reject(new InvalidProjectRootError()));
    const controller = createController(register);

    await expect(controller.register({ name: "", rootPath: "/workspace/arc" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.register({ name: "Arc", rootPath: "/missing" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("validates ignore requests before delegating to the policy service", async () => {
    const check = vi.fn(() =>
      Promise.resolve({
        ignored: true,
        kind: "directory" as const,
        path: "dist",
        projectId: registration.project.id,
        reason: {
          pattern: "dist/",
          source: "built_in_generated" as const,
          sourcePath: null,
        },
      }),
    );
    const controller = createController(vi.fn(), check);

    await expect(
      controller.checkIgnore(registration.project.id, { kind: "directory", path: "dist" }),
    ).resolves.toMatchObject({
      ignored: true,
      reason: { source: "built_in_generated" },
    });
    expect(check).toHaveBeenCalledWith(registration.project.id, { kind: "directory", path: "dist" });
    await expect(controller.checkIgnore("invalid", { kind: "file", path: "src/main.ts" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new InvalidProjectPathError(), BadRequestException],
    [new IgnoreRulesFileTooLargeError(".gitignore"), UnprocessableEntityException],
  ])("maps policy errors without leaking infrastructure details", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(
      controller.checkIgnore(registration.project.id, { kind: "file", path: "src/main.ts" }),
    ).rejects.toBeInstanceOf(expectedError);
  });

  it("starts a scan and returns the latest durable scan status", async () => {
    const scan = vi.fn(() => Promise.resolve(completedScan));
    const getLatestScan = vi.fn(() => Promise.resolve({ scan: completedScan }));
    const controller = createController(vi.fn(), vi.fn(), scan, getLatestScan);

    await expect(controller.scanInventory(registration.project.id)).resolves.toEqual(completedScan);
    await expect(controller.getLatestInventoryScan(registration.project.id)).resolves.toEqual({
      scan: completedScan,
    });
    expect(scan).toHaveBeenCalledWith(registration.project.id);
    expect(getLatestScan).toHaveBeenCalledWith(registration.project.id);
  });

  it.each([
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new ProjectScanAlreadyRunningError(registration.project.id), ConflictException],
    [new ProjectScanFailedError(), ServiceUnavailableException],
  ])("maps inventory errors to stable HTTP responses", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(controller.scanInventory(registration.project.id)).rejects.toBeInstanceOf(expectedError);
  });

  it("rejects malformed inventory project identifiers", async () => {
    const controller = createController(vi.fn());

    await expect(controller.scanInventory("invalid")).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getLatestInventoryScan("invalid")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("starts source indexing and returns latest catalog status", async () => {
    const index = vi.fn(() => Promise.resolve(completedSourceIndex));
    const getLatest = vi.fn(() =>
      Promise.resolve({
        currentCatalog: {
          completedAt: completedSourceIndex.completedAt,
          inspectedBytes: completedSourceIndex.inspectedBytes,
          inventoryScanId: completedSourceIndex.inventoryScanId,
          readyBytes: completedSourceIndex.readyBytes,
          readyFileCount: completedSourceIndex.readyFileCount,
          skippedFileCount: completedSourceIndex.skippedFileCount,
          sourceIndexId: completedSourceIndex.id,
          stale: false,
        },
        latestRun: completedSourceIndex,
      }),
    );
    const controller = createController(vi.fn(), vi.fn(), vi.fn(), vi.fn(), index, getLatest);

    await expect(controller.indexSources(registration.project.id)).resolves.toEqual(completedSourceIndex);
    await expect(controller.getLatestSourceIndex(registration.project.id)).resolves.toMatchObject({
      currentCatalog: { stale: false },
      latestRun: completedSourceIndex,
    });
  });

  it.each([
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new ProjectInventoryRequiredError(registration.project.id), ConflictException],
    [new ProjectSourceIndexAlreadyRunningError(registration.project.id), ConflictException],
    [new ProjectSourceIndexFailedError(), ServiceUnavailableException],
  ])("maps source index errors to stable HTTP responses", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(controller.indexSources(registration.project.id)).rejects.toBeInstanceOf(expectedError);
  });

  it("rejects malformed source-index project identifiers", async () => {
    const controller = createController(vi.fn());

    await expect(controller.indexSources("invalid")).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getLatestSourceIndex("invalid")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("starts symbol indexing and returns current symbol-catalog freshness", async () => {
    const indexSymbols = vi.fn(() => Promise.resolve(completedSymbolIndex));
    const getLatestSymbols = vi.fn(() =>
      Promise.resolve({
        currentCatalog: {
          completedAt: completedSymbolIndex.completedAt,
          failedFileCount: completedSymbolIndex.failedFileCount,
          omittedSymbolCount: completedSymbolIndex.omittedSymbolCount,
          parsedFileCount: completedSymbolIndex.parsedFileCount,
          reusedFileCount: completedSymbolIndex.reusedFileCount,
          sourceIndexRunId: completedSymbolIndex.sourceIndexRunId,
          stale: false,
          symbolCount: completedSymbolIndex.symbolCount,
          symbolIndexId: completedSymbolIndex.id,
          unsupportedFileCount: completedSymbolIndex.unsupportedFileCount,
        },
        latestRun: completedSymbolIndex,
      }),
    );
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      indexSymbols,
      getLatestSymbols,
    );

    await expect(controller.indexSymbols(registration.project.id)).resolves.toEqual(completedSymbolIndex);
    await expect(controller.getLatestSymbolIndex(registration.project.id)).resolves.toMatchObject({
      currentCatalog: { stale: false },
      latestRun: completedSymbolIndex,
    });
  });

  it.each([
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new ProjectSourceCatalogRequiredError(registration.project.id), ConflictException],
    [new ProjectSourceCatalogStaleError(registration.project.id), ConflictException],
    [new ProjectSymbolIndexAlreadyRunningError(registration.project.id), ConflictException],
    [new ProjectSymbolIndexFailedError(), ServiceUnavailableException],
  ])("maps symbol-index errors to stable HTTP responses", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(controller.indexSymbols(registration.project.id)).rejects.toBeInstanceOf(expectedError);
  });

  it("rejects malformed symbol-index project identifiers", async () => {
    const controller = createController(vi.fn());

    await expect(controller.indexSymbols("invalid")).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getLatestSymbolIndex("invalid")).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createController(
  register: ReturnType<typeof vi.fn>,
  check: ReturnType<typeof vi.fn> = vi.fn(),
  scan: ReturnType<typeof vi.fn> = vi.fn(),
  getLatestScan: ReturnType<typeof vi.fn> = vi.fn(),
  index: ReturnType<typeof vi.fn> = vi.fn(),
  getLatest: ReturnType<typeof vi.fn> = vi.fn(),
  indexSymbols: ReturnType<typeof vi.fn> = vi.fn(),
  getLatestSymbols: ReturnType<typeof vi.fn> = vi.fn(),
): ProjectsController {
  return new ProjectsController(
    { register } as unknown as ProjectRegistrationService,
    { check } as unknown as ProjectIgnorePolicyService,
    { getLatestScan, scan } as unknown as ProjectInventoryService,
    { getLatest, index } as unknown as ProjectSourceIndexService,
    { getLatest: getLatestSymbols, index: indexSymbols } as unknown as ProjectSymbolIndexService,
  );
}
