import { createHash } from "node:crypto";

import type {
  Project,
  ProjectDependencyIndex,
  ProjectFrameworkIndex,
  ProjectSourceIndex,
  ProjectSymbolIndex,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type {
  ProjectFrameworkIndexRepository,
  PublishProjectFrameworkIndexInput,
  ReusableProjectFrameworkCatalog,
} from "../domain/project-framework-index.types.js";
import type { ProjectSourceCatalogSnapshot, SourceTextReadResult } from "../domain/project-source-index.types.js";
import {
  ProjectFrameworkIndexFailedError,
  ProjectFrameworkUpstreamCatalogRequiredError,
  ProjectFrameworkUpstreamCatalogStaleError,
} from "../domain/project.errors.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectFrameworkIndexService } from "./project-framework-index.service.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";
import type { SourceTextReader } from "./source-text.reader.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const sourceIndexRunId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";
const symbolIndexRunId = "bfcd6c71-f627-45cb-b133-65cf2e129f13";
const firstDependencyIndexRunId = "76e5ee0b-608d-4792-91c5-fd46579e74e4";
const secondDependencyIndexRunId = "4f2fdaae-1b31-4484-9f0f-228912714432";
const packageFileId = "ac871053-d9f1-4f28-b022-1a18079927bb";
const sourceFileId = "83107b40-6495-455f-a557-b64b29ef6af1";
const packageContent = JSON.stringify({ dependencies: { express: "^5.0.0" }, name: "arc-api" });
const sourceContent = "export const ready = true;\n";

const project: Project = {
  createdAt: "2026-07-29T08:00:00.000Z",
  id: projectId,
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-29T08:00:00.000Z",
};

const sourceRun: ProjectSourceIndex = {
  completedAt: "2026-07-29T09:01:00.000Z",
  errorCode: null,
  id: sourceIndexRunId,
  inspectedBytes: packageContent.length + sourceContent.length,
  inventoryScanId: "72449150-b7e9-4410-8502-10e221dcdf43",
  limitReasons: [],
  projectId,
  readyBytes: packageContent.length + sourceContent.length,
  readyFileCount: 2,
  skippedFileCount: 0,
  startedAt: "2026-07-29T09:00:00.000Z",
  status: "completed",
};

const sourceCatalog: ProjectSourceCatalogSnapshot = {
  files: [
    {
      contentHash: sha256(packageContent),
      id: packageFileId,
      language: "json",
      modifiedAt: "2026-07-29T08:30:00.000Z",
      relativePath: "package.json",
      sizeBytes: Buffer.byteLength(packageContent),
    },
    {
      contentHash: sha256(sourceContent),
      id: sourceFileId,
      language: "typescript",
      modifiedAt: "2026-07-29T08:30:00.000Z",
      relativePath: "src/main.ts",
      sizeBytes: Buffer.byteLength(sourceContent),
    },
  ],
  run: sourceRun,
};

function symbolRun(overrides: Partial<ProjectSymbolIndex> = {}): ProjectSymbolIndex {
  return {
    completedAt: "2026-07-29T10:01:00.000Z",
    errorCode: null,
    failedFileCount: 0,
    id: symbolIndexRunId,
    limitReasons: [],
    omittedSymbolCount: 0,
    parsedFileCount: 1,
    projectId,
    reusedFileCount: 0,
    sourceIndexRunId,
    startedAt: "2026-07-29T10:00:00.000Z",
    status: "completed",
    symbolCount: 0,
    unsupportedFileCount: 1,
    ...overrides,
  };
}

function dependencyRun(
  id = firstDependencyIndexRunId,
  overrides: Partial<ProjectDependencyIndex> = {},
): ProjectDependencyIndex {
  return {
    bindingCount: 0,
    builtinEdgeCount: 0,
    completedAt: "2026-07-29T11:01:00.000Z",
    edgeCount: 0,
    errorCode: null,
    externalEdgeCount: 0,
    failedFileCount: 0,
    id,
    limitReasons: [],
    localEdgeCount: 0,
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    parsedFileCount: 1,
    projectId,
    resolutionContextHash: "d".repeat(64),
    resolverWarnings: [],
    reusedFileCount: 0,
    sourceIndexRunId,
    startedAt: "2026-07-29T11:00:00.000Z",
    status: "completed",
    unresolvedEdgeCount: 0,
    unsupportedFileCount: 1,
    ...overrides,
  };
}

function createFixture(options: { readonly sourceCatalog?: ProjectSourceCatalogSnapshot | null } = {}) {
  let selectedDependencyRun = dependencyRun();
  let currentFrameworkRun: ProjectFrameworkIndex | null = null;
  let reusableCatalog: ReusableProjectFrameworkCatalog | null = null;
  let nextRun = 1;

  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(project)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const getCurrentReadyCatalog = vi.fn(() =>
    Promise.resolve(options.sourceCatalog === undefined ? sourceCatalog : options.sourceCatalog),
  );
  const sourceRepository = {
    beginIndex: vi.fn(),
    completeIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(sourceRun)),
    getCurrentReadyCatalog,
    getLatestRun: vi.fn(() => Promise.resolve(sourceRun)),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSourceIndexRepository;
  const selectedSymbolRun = symbolRun();
  const symbolRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(selectedSymbolRun)),
    getCurrentFiles: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(selectedSymbolRun)),
    listCatalogSymbols: vi.fn(() => Promise.resolve({ hasMore: false, symbols: [] })),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSymbolIndexRepository;
  const dependencyRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    findGraphEdges: vi.fn(),
    findGraphFile: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(selectedDependencyRun)),
    getCurrentFiles: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(selectedDependencyRun)),
    listCatalogDependencies: vi.fn(() => Promise.resolve({ dependencies: [], hasMore: false })),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectDependencyIndexRepository;
  const beginIndex = vi.fn((input: Parameters<ProjectFrameworkIndexRepository["beginIndex"]>[0]) =>
    Promise.resolve(
      frameworkRun({
        analyzerSetIdentity: input.analyzerSetIdentity,
        dependencyIndexRunId: input.dependencyIndexRunId,
        id: `00000000-0000-4000-8000-${(nextRun++).toString().padStart(12, "0")}`,
        sourceIndexRunId: input.sourceIndexRunId,
        symbolIndexRunId: input.symbolIndexRunId,
      }),
    ),
  );
  const publishIndex = vi.fn((input: PublishProjectFrameworkIndexInput) => {
    currentFrameworkRun = frameworkRun({
      analyzedFileCount: input.analyzedFileCount,
      analyzerSetIdentity: beginIndex.mock.calls.at(-1)?.[0].analyzerSetIdentity ?? "a".repeat(64),
      completedAt: "2026-07-29T12:01:00.000Z",
      dependencyIndexRunId: input.dependencyIndexRunId,
      entityCount: input.files.reduce((sum, file) => sum + file.entities.length, 0),
      failedFileCount: input.failedFileCount,
      id: input.frameworkIndexId,
      limitReasons: input.limitReasons,
      omissionCount: input.files.reduce((sum, file) => sum + file.omissionCount, 0),
      relationshipCount: input.files.reduce((sum, file) => sum + file.relationships.length, 0),
      reusedFileCount: input.reusedFileCount,
      scopeCount: input.scopes.length,
      sourceIndexRunId: input.sourceIndexRunId,
      status: input.limitReasons.length === 0 ? "completed" : "limited",
      symbolIndexRunId: input.symbolIndexRunId,
      unsupportedFileCount: input.unsupportedFileCount,
      warnings: input.warnings,
    });
    reusableCatalog = {
      files: input.files,
      run: currentFrameworkRun,
      scopes: input.scopes,
    };
    return Promise.resolve(currentFrameworkRun);
  });
  const failIndex = vi.fn((failedProjectId: string, frameworkIndexId: string) =>
    Promise.resolve(
      frameworkRun({
        completedAt: "2026-07-29T12:01:00.000Z",
        errorCode: "framework_persistence_error",
        id: frameworkIndexId,
        projectId: failedProjectId,
        status: "failed",
      }),
    ),
  );
  const recoverInterruptedIndexes = vi.fn(() => Promise.resolve(0));
  const frameworkRepository = {
    beginIndex,
    failIndex,
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(currentFrameworkRun)),
    getCurrentReusableCatalog: vi.fn(() => Promise.resolve(reusableCatalog)),
    getLatestRun: vi.fn(() => Promise.resolve(currentFrameworkRun)),
    listCatalog: vi.fn(),
    publishIndex,
    recoverInterruptedIndexes,
  } satisfies ProjectFrameworkIndexRepository;
  const inspect = vi.fn((input: Parameters<SourceTextReader["inspect"]>[0]): Promise<SourceTextReadResult> => {
    const content = input.file.path === "package.json" ? packageContent : sourceContent;
    return Promise.resolve({
      content,
      contentHash: sha256(content),
      inspectedBytes: Buffer.byteLength(content),
      modifiedAt: input.file.modifiedAt,
      sizeBytes: Buffer.byteLength(content),
      status: "ready" as const,
    });
  });
  const sourceReader = { inspect } satisfies SourceTextReader;
  const service = new ProjectFrameworkIndexService(
    projectRepository,
    sourceRepository,
    symbolRepository,
    dependencyRepository,
    frameworkRepository,
    sourceReader,
    loadConfig({ ARC_PROJECT_FRAMEWORK_YIELD_EVERY_FILES: "1" }),
  );

  return {
    beginIndex,
    dependencyRepository,
    failIndex,
    frameworkRepository,
    getCurrentReadyCatalog,
    inspect,
    publishIndex,
    recoverInterruptedIndexes,
    service,
    setDependencyRun: (run: ProjectDependencyIndex) => {
      selectedDependencyRun = run;
    },
  };
}

describe("ProjectFrameworkIndexService", () => {
  it("publishes fresh evidence, then relinks unchanged files with zero source reads", async () => {
    const fixture = createFixture();

    await expect(fixture.service.index(projectId)).resolves.toMatchObject({
      analyzedFileCount: 1,
      reusedFileCount: 0,
      status: "completed",
      unsupportedFileCount: 1,
    });
    expect(fixture.inspect).toHaveBeenCalledTimes(2);
    const firstPublication = fixture.publishIndex.mock.calls[0]?.[0];
    expect(JSON.stringify(firstPublication)).not.toContain(sourceContent);
    expect(JSON.stringify(firstPublication)).not.toContain(project.rootPath);

    fixture.setDependencyRun(dependencyRun(secondDependencyIndexRunId));
    fixture.inspect.mockClear();

    await expect(fixture.service.index(projectId)).resolves.toMatchObject({
      dependencyIndexRunId: secondDependencyIndexRunId,
      reusedFileCount: 1,
      status: "completed",
    });
    expect(fixture.inspect).not.toHaveBeenCalled();
    expect(fixture.publishIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({
        analyzedFileCount: 0,
        dependencyIndexRunId: secondDependencyIndexRunId,
        reusedFileCount: 1,
      }),
    );
  });

  it("returns the exact current run without creating work or reading source", async () => {
    const fixture = createFixture();
    const first = await fixture.service.index(projectId);
    fixture.beginIndex.mockClear();
    fixture.inspect.mockClear();

    await expect(fixture.service.index(projectId)).resolves.toEqual(first);
    expect(fixture.beginIndex).not.toHaveBeenCalled();
    expect(fixture.frameworkRepository.getCurrentReusableCatalog).toHaveBeenCalledTimes(0);
    expect(fixture.inspect).not.toHaveBeenCalled();
  });

  it("reports current framework catalog freshness independently from the latest run", async () => {
    const fixture = createFixture();
    await fixture.service.index(projectId);

    await expect(fixture.service.getLatest(projectId)).resolves.toMatchObject({
      currentCatalog: { stale: false },
      latestRun: { status: "completed" },
    });

    fixture.setDependencyRun(dependencyRun(secondDependencyIndexRunId));
    await expect(fixture.service.getLatest(projectId)).resolves.toMatchObject({
      currentCatalog: { stale: true },
      latestRun: { status: "completed" },
    });
  });

  it("rejects missing and incoherent upstream catalogs before creating a run", async () => {
    const missing = createFixture({ sourceCatalog: null });
    await expect(missing.service.index(projectId)).rejects.toBeInstanceOf(ProjectFrameworkUpstreamCatalogRequiredError);
    expect(missing.beginIndex).not.toHaveBeenCalled();

    const stale = createFixture();
    stale.setDependencyRun(dependencyRun(firstDependencyIndexRunId, { sourceIndexRunId: symbolIndexRunId }));
    await expect(stale.service.index(projectId)).rejects.toBeInstanceOf(ProjectFrameworkUpstreamCatalogStaleError);
    expect(stale.beginIndex).not.toHaveBeenCalled();
  });

  it("fails a running framework index when a ready source fingerprint becomes stale", async () => {
    const fixture = createFixture();
    fixture.inspect.mockResolvedValueOnce({
      inspectedBytes: 0,
      modifiedAt: "2026-07-29T08:30:00.000Z",
      sizeBytes: 0,
      skipReason: "file_missing",
      status: "skipped",
    });

    await expect(fixture.service.index(projectId)).rejects.toBeInstanceOf(ProjectFrameworkUpstreamCatalogStaleError);
    expect(fixture.failIndex).toHaveBeenCalledWith(projectId, expect.any(String), "upstream_catalog_changed");
    expect(fixture.publishIndex).not.toHaveBeenCalled();
  });

  it("fails publication outside the catalog transaction and recovers interrupted runs", async () => {
    const fixture = createFixture();
    fixture.publishIndex.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(fixture.service.index(projectId)).rejects.toBeInstanceOf(ProjectFrameworkIndexFailedError);
    expect(fixture.failIndex).toHaveBeenCalledWith(projectId, expect.any(String), "framework_persistence_error");

    fixture.recoverInterruptedIndexes.mockResolvedValueOnce(2);
    await expect(fixture.service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(fixture.recoverInterruptedIndexes).toHaveBeenCalledOnce();

    fixture.recoverInterruptedIndexes.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(fixture.service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});

function frameworkRun(overrides: Partial<ProjectFrameworkIndex> = {}): ProjectFrameworkIndex {
  return {
    analyzedFileCount: 0,
    analyzerSetIdentity: "a".repeat(64),
    completedAt: null,
    dependencyIndexRunId: firstDependencyIndexRunId,
    entityCount: 0,
    errorCode: null,
    failedFileCount: 0,
    id: "00000000-0000-4000-8000-000000000001",
    limitReasons: [],
    omissionCount: 0,
    projectId,
    relationshipCount: 0,
    reusedFileCount: 0,
    scopeCount: 0,
    sourceIndexRunId,
    startedAt: "2026-07-29T12:00:00.000Z",
    status: "running",
    symbolIndexRunId,
    unresolvedRelationshipCount: 0,
    unsupportedFileCount: 0,
    warnings: [],
    ...overrides,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
