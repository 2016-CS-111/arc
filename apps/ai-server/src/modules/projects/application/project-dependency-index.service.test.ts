import type {
  Project,
  ProjectDependencyIndex,
  ProjectDependencyIndexErrorCode,
  ProjectScan,
  ProjectSourceIndex,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type {
  CurrentProjectDependencyFile,
  ExtractedSourceDependency,
  ExtractSourceDependenciesInput,
  PublishProjectDependencyIndexInput,
  SourceDependencyExtractionResult,
} from "../domain/project-dependency-index.types.js";
import type { ProjectSourceCatalogSnapshot, ReadyProjectSourceFile } from "../domain/project-source-index.types.js";
import {
  ProjectDependencyIndexFailedError,
  ProjectNotFoundError,
  ProjectSourceCatalogRequiredError,
  ProjectSourceCatalogStaleError,
} from "../domain/project.errors.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectModuleResolver } from "./project-module.resolver.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { SourceDependencyExtractor } from "./source-dependency.extractor.js";
import type { SourceTextReader } from "./source-text.reader.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectDependencyIndexService } from "./project-dependency-index.service.js";

const project: Project = {
  createdAt: "2026-07-28T08:00:00.000Z",
  id: "03f4c07e-e890-454d-b557-17b780906ceb",
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-28T08:00:00.000Z",
};

const inventoryScan: ProjectScan = {
  completedAt: "2026-07-28T09:01:00.000Z",
  errorCode: null,
  fileCount: 3,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 0,
  limitReasons: [],
  projectId: project.id,
  skippedSymlinkCount: 0,
  startedAt: "2026-07-28T09:00:00.000Z",
  status: "completed",
  totalBytes: 96,
};

const sourceIndex: ProjectSourceIndex = {
  completedAt: "2026-07-28T10:01:00.000Z",
  errorCode: null,
  id: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  inspectedBytes: 96,
  inventoryScanId: inventoryScan.id,
  limitReasons: [],
  projectId: project.id,
  readyBytes: 96,
  readyFileCount: 3,
  skippedFileCount: 0,
  startedAt: "2026-07-28T10:00:00.000Z",
  status: "completed",
};

const mainFile = sourceFile("ac871053-d9f1-4f28-b022-1a18079927bb", "src/main.ts", "a");
const targetFile = sourceFile("83107b40-6495-455f-a557-b64b29ef6af1", "src/target.ts", "b");
const markdownFile = {
  ...sourceFile("0b9cf292-49fb-4c7e-b0c7-48c720129bd9", "README.md", "c"),
  language: "markdown",
};
const sourceCatalog: ProjectSourceCatalogSnapshot = {
  files: [mainFile, targetFile, markdownFile],
  run: sourceIndex,
};

const runningDependencyIndex: ProjectDependencyIndex = {
  bindingCount: 0,
  builtinEdgeCount: 0,
  completedAt: null,
  edgeCount: 0,
  errorCode: null,
  externalEdgeCount: 0,
  failedFileCount: 0,
  id: "76e5ee0b-608d-4792-91c5-fd46579e74e4",
  limitReasons: [],
  localEdgeCount: 0,
  omittedBindingCount: 0,
  omittedEdgeCount: 0,
  parsedFileCount: 0,
  projectId: project.id,
  resolutionContextHash: null,
  resolverWarnings: [],
  reusedFileCount: 0,
  sourceIndexRunId: sourceIndex.id,
  startedAt: "2026-07-28T11:00:00.000Z",
  status: "running",
  unresolvedEdgeCount: 0,
  unsupportedFileCount: 0,
};

interface FixtureOptions {
  readonly config?: NodeJS.ProcessEnv;
  readonly currentFiles?: readonly CurrentProjectDependencyFile[];
  readonly currentSourceRun?: ProjectSourceIndex | null;
  readonly extractorIdentityError?: Error;
  readonly inventory?: ProjectScan | null;
  readonly metadataChangesAfterPrepare?: boolean;
  readonly prepareError?: Error;
  readonly projectResult?: Project | null;
  readonly publishError?: Error;
  readonly resolverKind?: "local" | "unresolved";
  readonly sourceCatalog?: ProjectSourceCatalogSnapshot | null;
  readonly sourceHashMismatchPath?: string;
}

function createFixture(options: FixtureOptions = {}) {
  const selectedCatalog = options.sourceCatalog === undefined ? sourceCatalog : options.sourceCatalog;
  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(options.projectResult === undefined ? project : options.projectResult)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const inventoryRepository = {
    beginScan: vi.fn(),
    completeScan: vi.fn(),
    failScan: vi.fn(),
    getCurrentSnapshot: vi.fn(() =>
      Promise.resolve(
        options.inventory === null
          ? null
          : {
              files: [],
              scan: options.inventory ?? inventoryScan,
            },
      ),
    ),
    getLatestScan: vi.fn(),
    recoverInterruptedScans: vi.fn(),
  } satisfies ProjectInventoryRepository;
  const sourceIndexRepository = {
    beginIndex: vi.fn(),
    completeIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(options.currentSourceRun ?? sourceIndex)),
    getCurrentReadyCatalog: vi.fn(() => Promise.resolve(selectedCatalog)),
    getLatestRun: vi.fn(() => Promise.resolve(sourceIndex)),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSourceIndexRepository;

  const beginIndex = vi.fn(() => Promise.resolve(runningDependencyIndex));
  const publishIndex = vi.fn((input: PublishProjectDependencyIndexInput) =>
    options.publishError === undefined
      ? Promise.resolve({
          ...runningDependencyIndex,
          bindingCount: input.bindingCount,
          builtinEdgeCount: input.builtinEdgeCount,
          completedAt: "2026-07-28T11:01:00.000Z",
          edgeCount: input.edgeCount,
          externalEdgeCount: input.externalEdgeCount,
          failedFileCount: input.failedFileCount,
          limitReasons: [...input.limitReasons],
          localEdgeCount: input.localEdgeCount,
          omittedBindingCount: input.omittedBindingCount,
          omittedEdgeCount: input.omittedEdgeCount,
          parsedFileCount: input.parsedFileCount,
          resolutionContextHash: input.resolutionContextHash,
          resolverWarnings: [...input.resolverWarnings],
          reusedFileCount: input.reusedFileCount,
          status: input.limitReasons.length === 0 ? ("completed" as const) : ("limited" as const),
          unresolvedEdgeCount: input.unresolvedEdgeCount,
          unsupportedFileCount: input.unsupportedFileCount,
        })
      : Promise.reject(options.publishError),
  );
  const failIndex = vi.fn(
    ({
      errorCode,
      resolutionContextHash,
      resolverWarnings,
    }: {
      readonly errorCode: ProjectDependencyIndexErrorCode;
      readonly resolutionContextHash?: string;
      readonly resolverWarnings?: readonly ProjectDependencyIndex["resolverWarnings"][number][];
    }): Promise<ProjectDependencyIndex> =>
      Promise.resolve({
        ...runningDependencyIndex,
        completedAt: "2026-07-28T11:01:00.000Z",
        errorCode,
        resolutionContextHash: resolutionContextHash ?? null,
        resolverWarnings: [...(resolverWarnings ?? [])],
        status: "failed",
      }),
  );
  const dependencyIndexRepository = {
    beginIndex,
    failIndex,
    getCurrentCatalogRun: vi.fn(() =>
      Promise.resolve({
        ...runningDependencyIndex,
        bindingCount: 1,
        completedAt: "2026-07-28T11:01:00.000Z",
        edgeCount: 1,
        localEdgeCount: 1,
        resolutionContextHash: "d".repeat(64),
        status: "completed" as const,
      }),
    ),
    getCurrentFiles: vi.fn(() => Promise.resolve(options.currentFiles ?? [])),
    getLatestRun: vi.fn(() => Promise.resolve(runningDependencyIndex)),
    publishIndex,
    recoverInterruptedIndexes: vi.fn(() => Promise.resolve(0)),
  } satisfies ProjectDependencyIndexRepository;

  const inspect = vi.fn(
    ({ file }: Parameters<SourceTextReader["inspect"]>[0]): ReturnType<SourceTextReader["inspect"]> => {
      const catalogFile = selectedCatalog?.files.find((candidate) => candidate.relativePath === file.path);
      if (catalogFile === undefined) {
        return Promise.resolve({
          inspectedBytes: 0,
          modifiedAt: file.modifiedAt,
          sizeBytes: file.sizeBytes,
          skipReason: "file_missing",
          status: "skipped",
        });
      }
      const priorReads = inspect.mock.calls.filter(([input]) => input.file.path === file.path).length - 1;
      return Promise.resolve({
        content: catalogFile.relativePath,
        contentHash:
          options.sourceHashMismatchPath === catalogFile.relativePath ||
          (options.metadataChangesAfterPrepare === true &&
            catalogFile.relativePath === "package.json" &&
            priorReads > 0)
            ? "f".repeat(64)
            : catalogFile.contentHash,
        inspectedBytes: catalogFile.sizeBytes,
        modifiedAt: catalogFile.modifiedAt,
        sizeBytes: catalogFile.sizeBytes,
        status: "ready",
      });
    },
  );
  const sourceTextReader = { inspect } satisfies SourceTextReader;

  const extract = vi.fn((input: ExtractSourceDependenciesInput): SourceDependencyExtractionResult => ({
    dependencies: input.source.includes("target") ? [] : [dependency()],
    extractorIdentity: "tree-sitter/typescript/dependencies@1",
    hasSyntaxErrors: false,
    omissionReasons: [],
    omittedBindingCount: 0,
    omittedDependencyCount: 0,
  }));
  const dependencyExtractor = {
    extract,
    getExtractorIdentity: vi.fn(() => {
      if (options.extractorIdentityError !== undefined) {
        throw options.extractorIdentityError;
      }
      return "tree-sitter/typescript/dependencies@1";
    }),
    supports: (language: string): language is "typescript" => language === "typescript",
  } satisfies SourceDependencyExtractor;

  const resolve = vi.fn(() =>
    options.resolverKind === "unresolved"
      ? ({ kind: "unresolved", reason: "not_found" } as const)
      : ({
          kind: "local",
          targetRelativePath: targetFile.relativePath,
          targetSourceFileId: targetFile.id,
        } as const),
  );
  const prepare = vi.fn(() => {
    if (options.prepareError !== undefined) {
      throw options.prepareError;
    }
    return {
      resolutionContextHash: "d".repeat(64),
      resolverIdentity: "typescript@5.9.3/arc-module-resolver@1",
      resolve,
      warnings: [{ code: "config_missing" as const, relativePath: null }],
    };
  });
  const moduleResolver = { prepare } satisfies ProjectModuleResolver;
  const config = loadConfig({
    ARC_PROJECT_DEPENDENCY_BATCH_SIZE: "2",
    ARC_PROJECT_DEPENDENCY_MAX_BINDINGS_PER_EDGE: "2",
    ARC_PROJECT_DEPENDENCY_MAX_EDGES_PER_FILE: "2",
    ARC_PROJECT_DEPENDENCY_MAX_TOTAL_BINDINGS: "3",
    ARC_PROJECT_DEPENDENCY_MAX_TOTAL_EDGES: "3",
    ARC_PROJECT_DEPENDENCY_YIELD_EVERY_FILES: "1",
    ...options.config,
  });
  const service = new ProjectDependencyIndexService(
    projectRepository,
    inventoryRepository,
    sourceIndexRepository,
    dependencyIndexRepository,
    sourceTextReader,
    dependencyExtractor,
    moduleResolver,
    config,
  );

  return {
    beginIndex,
    dependencyIndexRepository,
    extract,
    failIndex,
    inspect,
    prepare,
    publishIndex,
    resolve,
    service,
  };
}

describe("ProjectDependencyIndexService", () => {
  it("extracts supported files, resolves edges, and records unsupported files without source text", async () => {
    const fixture = createFixture();

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      bindingCount: 1,
      edgeCount: 1,
      localEdgeCount: 1,
      parsedFileCount: 2,
      status: "completed",
      unsupportedFileCount: 1,
    });
    expect(fixture.extract).toHaveBeenCalledTimes(2);
    expect(fixture.resolve).toHaveBeenCalledOnce();
    expect(fixture.publishIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({ relativePath: "README.md", status: "unsupported" }),
          expect.objectContaining({ relativePath: "src/main.ts", status: "extracted" }),
          expect.objectContaining({ relativePath: "src/target.ts", status: "extracted" }),
        ],
        resolutionContextHash: "d".repeat(64),
        resolverWarnings: ["config_missing"],
      }),
    );
    const publication = fixture.publishIndex.mock.calls[0]?.[0];
    expect(JSON.stringify(publication)).not.toContain("import {");
    expect(publication?.files.every((file) => !("content" in file))).toBe(true);
  });

  it("reuses unchanged declarations with zero code reads and re-resolves every edge", async () => {
    const extractorIdentity =
      "tree-sitter/typescript/dependencies@1/edges=2/bindings=2/specifier=1024/binding-name=512";
    const currentFiles: readonly CurrentProjectDependencyFile[] = [
      currentFile(mainFile, extractorIdentity, [dependency()]),
      currentFile(targetFile, extractorIdentity, []),
      {
        ...currentFile(markdownFile, "unsupported:markdown", []),
        errorCode: "unsupported_language",
        status: "unsupported",
      },
    ];
    const fixture = createFixture({ currentFiles, resolverKind: "unresolved" });

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      edgeCount: 1,
      reusedFileCount: 3,
      unresolvedEdgeCount: 1,
    });
    expect(fixture.inspect).not.toHaveBeenCalled();
    expect(fixture.extract).not.toHaveBeenCalled();
    expect(fixture.resolve).toHaveBeenCalledOnce();
    expect(fixture.publishIndex.mock.calls[0]?.[0].files).toContainEqual(
      expect.objectContaining({
        dependencies: [expect.objectContaining({ resolution: { kind: "unresolved", reason: "not_found" } })],
        extractedAt: "2026-07-28T10:30:00.000Z",
        sourceFileId: mainFile.id,
      }),
    );
  });

  it("publishes deterministic limited outcomes at total edge and binding caps", async () => {
    const edgeLimitedCatalog: ProjectSourceCatalogSnapshot = {
      files: [
        sourceFile("ac871053-d9f1-4f28-b022-1a18079927bb", "src/one.ts", "a"),
        sourceFile("83107b40-6495-455f-a557-b64b29ef6af1", "src/two.ts", "b"),
      ],
      run: sourceIndex,
    };
    const edgeLimited = createFixture({
      config: { ARC_PROJECT_DEPENDENCY_MAX_TOTAL_EDGES: "1" },
      sourceCatalog: edgeLimitedCatalog,
    });

    await expect(edgeLimited.service.index(project.id)).resolves.toMatchObject({
      edgeCount: 1,
      limitReasons: ["total_edges"],
      status: "limited",
    });
    expect(edgeLimited.extract).toHaveBeenCalledOnce();
    expect(edgeLimited.publishIndex.mock.calls[0]?.[0].files).toContainEqual(
      expect.objectContaining({
        errorCode: "dependency_limit",
        relativePath: "src/two.ts",
        status: "limited",
      }),
    );

    const twoEdges = createFixture({
      config: { ARC_PROJECT_DEPENDENCY_MAX_TOTAL_BINDINGS: "1" },
      sourceCatalog: {
        files: [mainFile],
        run: sourceIndex,
      },
    });
    twoEdges.extract.mockReturnValueOnce({
      dependencies: [dependency("./one.js", "1"), dependency("./two.js", "2")],
      extractorIdentity: "tree-sitter/typescript/dependencies@1",
      hasSyntaxErrors: false,
      omissionReasons: [],
      omittedBindingCount: 0,
      omittedDependencyCount: 0,
    });

    await expect(twoEdges.service.index(project.id)).resolves.toMatchObject({
      bindingCount: 1,
      edgeCount: 1,
      limitReasons: ["total_bindings"],
      status: "limited",
    });
  });

  it("publishes a durable failed-file state when source content no longer matches", async () => {
    const fixture = createFixture({ sourceHashMismatchPath: mainFile.relativePath });

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      failedFileCount: 1,
      parsedFileCount: 1,
    });
    expect(fixture.publishIndex.mock.calls[0]?.[0].files).toContainEqual(
      expect.objectContaining({
        dependencies: [],
        errorCode: "source_changed",
        sourceFileId: mainFile.id,
        status: "failed",
      }),
    );
  });

  it("requires a registered project and a fresh source catalog", async () => {
    await expect(createFixture({ projectResult: null }).service.index(project.id)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(createFixture({ sourceCatalog: null }).service.index(project.id)).rejects.toBeInstanceOf(
      ProjectSourceCatalogRequiredError,
    );
    await expect(
      createFixture({
        inventory: {
          ...inventoryScan,
          id: "e09f7c25-f4ae-48cb-af5b-0cd82bd30da1",
        },
      }).service.index(project.id),
    ).rejects.toBeInstanceOf(ProjectSourceCatalogStaleError);
  });

  it("records extractor, resolver, context, and persistence failures without partial publication", async () => {
    const extractorFailure = createFixture({ extractorIdentityError: new Error("native parser unavailable") });
    await expect(extractorFailure.service.index(project.id)).rejects.toBeInstanceOf(ProjectDependencyIndexFailedError);
    expect(extractorFailure.failIndex).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "extractor_unavailable" }),
    );
    expect(extractorFailure.publishIndex).not.toHaveBeenCalled();

    const resolverFailure = createFixture({ prepareError: new Error("typescript unavailable") });
    await expect(resolverFailure.service.index(project.id)).rejects.toBeInstanceOf(ProjectDependencyIndexFailedError);
    expect(resolverFailure.failIndex).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "resolver_unavailable" }),
    );

    const contextFailure = createFixture({
      currentSourceRun: {
        ...sourceIndex,
        id: "0bfec1c9-fbb7-4a32-937a-d7b8712ce52a",
      },
    });
    await expect(contextFailure.service.index(project.id)).rejects.toBeInstanceOf(ProjectDependencyIndexFailedError);
    expect(contextFailure.failIndex).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "resolution_context_changed" }),
    );
    expect(contextFailure.publishIndex).not.toHaveBeenCalled();

    const metadataFailure = createFixture({
      metadataChangesAfterPrepare: true,
      sourceCatalog: {
        files: [
          mainFile,
          {
            ...sourceFile("f7ce42e8-0da5-4538-9754-254f7879ece8", "package.json", "e"),
            language: "json",
          },
        ],
        run: sourceIndex,
      },
    });
    await expect(metadataFailure.service.index(project.id)).rejects.toBeInstanceOf(ProjectDependencyIndexFailedError);
    expect(metadataFailure.failIndex).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "resolution_context_changed" }),
    );
    expect(metadataFailure.publishIndex).not.toHaveBeenCalled();

    const persistenceFailure = createFixture({ publishError: new Error("database unavailable") });
    await expect(persistenceFailure.service.index(project.id)).rejects.toBeInstanceOf(
      ProjectDependencyIndexFailedError,
    );
    expect(persistenceFailure.failIndex).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "dependency_persistence_error" }),
    );
  });

  it("reports catalog freshness independently from the latest run and recovers interrupted runs", async () => {
    const fixture = createFixture();
    fixture.dependencyIndexRepository.getLatestRun = vi.fn(() =>
      Promise.resolve({
        ...runningDependencyIndex,
        completedAt: "2026-07-28T11:02:00.000Z",
        errorCode: "index_interrupted",
        status: "failed",
      }),
    );

    await expect(fixture.service.getLatest(project.id)).resolves.toMatchObject({
      currentCatalog: {
        dependencyIndexId: runningDependencyIndex.id,
        stale: false,
      },
      latestRun: {
        errorCode: "index_interrupted",
        status: "failed",
      },
    });

    fixture.dependencyIndexRepository.recoverInterruptedIndexes = vi.fn(() => Promise.resolve(2));
    await expect(fixture.service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(fixture.dependencyIndexRepository.recoverInterruptedIndexes).toHaveBeenCalledOnce();
  });
});

function sourceFile(id: string, relativePath: string, hashCharacter: string): ReadyProjectSourceFile {
  return {
    contentHash: hashCharacter.repeat(64),
    id,
    language: "typescript",
    modifiedAt: "2026-07-28T09:30:00.000Z",
    relativePath,
    sizeBytes: 32,
  };
}

function dependency(specifier = "./target.js", keySuffix = ""): ExtractedSourceDependency {
  return {
    bindings: [
      {
        bindingKey: `${keySuffix}${"b".repeat(64)}`.slice(0, 64),
        exportedName: null,
        importedName: "target",
        kind: "named",
        localName: "target",
        range: {
          endByte: 12,
          endColumnByte: 12,
          endLine: 0,
          startByte: 6,
          startColumnByte: 6,
          startLine: 0,
        },
        typeOnly: false,
      },
    ],
    extractionKey: `${keySuffix}${"a".repeat(64)}`.slice(0, 64),
    kind: "static_import",
    range: {
      endByte: 31,
      endColumnByte: 31,
      endLine: 0,
      startByte: 0,
      startColumnByte: 0,
      startLine: 0,
    },
    specifier,
    specifierRange: {
      endByte: 29,
      endColumnByte: 29,
      endLine: 0,
      startByte: 18,
      startColumnByte: 18,
      startLine: 0,
    },
    typeOnly: false,
  };
}

function currentFile(
  file: ReadyProjectSourceFile,
  extractorIdentity: string,
  dependencies: readonly ExtractedSourceDependency[],
): CurrentProjectDependencyFile {
  return {
    bindingCount: dependencies.reduce((count, item) => count + item.bindings.length, 0),
    dependencies,
    edgeCount: dependencies.length,
    errorCode: null,
    extractedAt: "2026-07-28T10:30:00.000Z",
    extractorIdentity,
    hasSyntaxErrors: false,
    language: file.language,
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    relativePath: file.relativePath,
    sourceContentHash: file.contentHash,
    sourceFileId: file.id,
    status: "extracted",
  };
}
