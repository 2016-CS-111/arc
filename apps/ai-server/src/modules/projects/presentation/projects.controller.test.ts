import type {
  ProjectDependencyGraphResponse,
  ProjectDependencyIndex,
  ProjectScan,
  ProjectSourceIndex,
  ProjectSymbolIndex,
  RegisterProjectResponse,
} from "@arc/contracts";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ProjectIgnorePolicyService } from "../application/project-ignore-policy.service.js";
import type { ProjectDependencyGraphService } from "../application/project-dependency-graph.service.js";
import type { ProjectDependencyIndexService } from "../application/project-dependency-index.service.js";
import type { ProjectInventoryService } from "../application/project-inventory.service.js";
import type { ProjectRegistrationService } from "../application/project-registration.service.js";
import type { ProjectSourceIndexService } from "../application/project-source-index.service.js";
import type { ProjectSymbolIndexService } from "../application/project-symbol-index.service.js";
import {
  IgnoreRulesFileTooLargeError,
  InvalidProjectPathError,
  InvalidProjectRootError,
  ProjectDependencyCatalogRequiredError,
  ProjectDependencyCatalogStaleError,
  ProjectDependencyGraphFailedError,
  ProjectDependencyIndexAlreadyRunningError,
  ProjectDependencyIndexFailedError,
  ProjectDependencyPathNotFoundError,
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

const completedDependencyIndex: ProjectDependencyIndex = {
  bindingCount: 3,
  builtinEdgeCount: 1,
  completedAt: "2026-07-28T12:01:00.000Z",
  edgeCount: 4,
  errorCode: null,
  externalEdgeCount: 1,
  failedFileCount: 0,
  id: "76e5ee0b-608d-4792-91c5-fd46579e74e4",
  limitReasons: [],
  localEdgeCount: 1,
  omittedBindingCount: 0,
  omittedEdgeCount: 0,
  parsedFileCount: 8,
  projectId: registration.project.id,
  resolutionContextHash: "d".repeat(64),
  resolverWarnings: ["config_missing"],
  reusedFileCount: 2,
  sourceIndexRunId: completedSourceIndex.id,
  startedAt: "2026-07-28T12:00:00.000Z",
  status: "completed",
  unresolvedEdgeCount: 1,
  unsupportedFileCount: 1,
};

const dependencyGraph: ProjectDependencyGraphResponse = {
  dependencyIndexId: completedDependencyIndex.id,
  depth: 1,
  direction: "outgoing",
  edges: [
    {
      bindings: [],
      externalPackage: null,
      id: "0ff1777d-03a4-4299-8303-4da001503f68",
      kind: "static_import",
      range: {
        endByte: 31,
        endColumnByte: 31,
        endLine: 0,
        startByte: 0,
        startColumnByte: 0,
        startLine: 0,
      },
      resolutionKind: "unresolved",
      sourceFileId: "ac871053-d9f1-4f28-b022-1a18079927bb",
      sourceNodeId: "file:ac871053-d9f1-4f28-b022-1a18079927bb",
      sourcePath: "src/main.ts",
      specifier: "./missing.js",
      specifierRange: {
        endByte: 29,
        endColumnByte: 29,
        endLine: 0,
        startByte: 18,
        startColumnByte: 18,
        startLine: 0,
      },
      targetNodeId: null,
      targetPath: null,
      targetSourceFileId: null,
      typeOnly: false,
      unresolvedReason: "not_found",
    },
  ],
  nodes: [
    {
      id: "file:ac871053-d9f1-4f28-b022-1a18079927bb",
      kind: "file",
      path: "src/main.ts",
      sourceFileId: "ac871053-d9f1-4f28-b022-1a18079927bb",
    },
  ],
  projectId: registration.project.id,
  sourceIndexRunId: completedSourceIndex.id,
  startPath: "src/main.ts",
  truncated: { depth: false, edges: false, nodes: false },
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

  it("starts dependency indexing and returns current graph-catalog freshness", async () => {
    const indexDependencies = vi.fn(() => Promise.resolve(completedDependencyIndex));
    const getLatestDependencies = vi.fn(() =>
      Promise.resolve({
        currentCatalog: {
          bindingCount: completedDependencyIndex.bindingCount,
          builtinEdgeCount: completedDependencyIndex.builtinEdgeCount,
          completedAt: completedDependencyIndex.completedAt,
          dependencyIndexId: completedDependencyIndex.id,
          edgeCount: completedDependencyIndex.edgeCount,
          externalEdgeCount: completedDependencyIndex.externalEdgeCount,
          failedFileCount: completedDependencyIndex.failedFileCount,
          localEdgeCount: completedDependencyIndex.localEdgeCount,
          limitReasons: completedDependencyIndex.limitReasons,
          omittedBindingCount: completedDependencyIndex.omittedBindingCount,
          omittedEdgeCount: completedDependencyIndex.omittedEdgeCount,
          parsedFileCount: completedDependencyIndex.parsedFileCount,
          resolutionContextHash: "d".repeat(64),
          resolverWarnings: completedDependencyIndex.resolverWarnings,
          reusedFileCount: completedDependencyIndex.reusedFileCount,
          sourceIndexRunId: completedDependencyIndex.sourceIndexRunId,
          stale: false,
          unresolvedEdgeCount: completedDependencyIndex.unresolvedEdgeCount,
          unsupportedFileCount: completedDependencyIndex.unsupportedFileCount,
        },
        latestRun: completedDependencyIndex,
      }),
    );
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      indexDependencies,
      getLatestDependencies,
    );

    await expect(controller.indexDependencies(registration.project.id)).resolves.toEqual(completedDependencyIndex);
    await expect(controller.getLatestDependencyIndex(registration.project.id)).resolves.toMatchObject({
      currentCatalog: { stale: false },
      latestRun: completedDependencyIndex,
    });
  });

  it.each([
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new ProjectSourceCatalogRequiredError(registration.project.id), ConflictException],
    [new ProjectSourceCatalogStaleError(registration.project.id), ConflictException],
    [new ProjectDependencyIndexAlreadyRunningError(registration.project.id), ConflictException],
    [new ProjectDependencyIndexFailedError(), ServiceUnavailableException],
  ])("maps dependency-index errors to stable HTTP responses", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(controller.indexDependencies(registration.project.id)).rejects.toBeInstanceOf(expectedError);
  });

  it("rejects malformed dependency-index project identifiers", async () => {
    const controller = createController(vi.fn());

    await expect(controller.indexDependencies("invalid")).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getLatestDependencyIndex("invalid")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates dependency graph queries and returns the bounded graph", async () => {
    const getGraph = vi.fn(() => Promise.resolve(dependencyGraph));
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      getGraph,
    );

    await expect(controller.getDependencyGraph(registration.project.id, { path: "src/main.ts" })).resolves.toEqual(
      dependencyGraph,
    );
    expect(getGraph).toHaveBeenCalledWith(registration.project.id, {
      dependencyKind: [],
      depth: 1,
      direction: "outgoing",
      includeBindings: false,
      maxEdges: 500,
      maxNodes: 100,
      path: "src/main.ts",
      resolutionKind: [],
    });
    await expect(
      controller.getDependencyGraph(registration.project.id, { depth: "0", path: "src/main.ts" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    [new InvalidProjectPathError(), BadRequestException],
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new ProjectDependencyPathNotFoundError("src/missing.ts"), NotFoundException],
    [new ProjectDependencyCatalogRequiredError(registration.project.id), ConflictException],
    [new ProjectDependencyCatalogStaleError(registration.project.id), ConflictException],
    [new ProjectDependencyGraphFailedError(), ServiceUnavailableException],
  ])("maps dependency graph errors to stable HTTP responses", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(
      controller.getDependencyGraph(registration.project.id, { path: "src/main.ts" }),
    ).rejects.toBeInstanceOf(expectedError);
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
  indexDependencies: ReturnType<typeof vi.fn> = vi.fn(),
  getLatestDependencies: ReturnType<typeof vi.fn> = vi.fn(),
  getGraph: ReturnType<typeof vi.fn> = vi.fn(),
): ProjectsController {
  return new ProjectsController(
    { register } as unknown as ProjectRegistrationService,
    { check } as unknown as ProjectIgnorePolicyService,
    { getLatestScan, scan } as unknown as ProjectInventoryService,
    { getLatest, index } as unknown as ProjectSourceIndexService,
    { getLatest: getLatestSymbols, index: indexSymbols } as unknown as ProjectSymbolIndexService,
    {
      getLatest: getLatestDependencies,
      index: indexDependencies,
    } as unknown as ProjectDependencyIndexService,
    { getGraph } as unknown as ProjectDependencyGraphService,
  );
}
