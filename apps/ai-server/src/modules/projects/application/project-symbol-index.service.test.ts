import type {
  Project,
  ProjectScan,
  ProjectSourceIndex,
  ProjectSymbolIndex,
  ProjectSymbolIndexErrorCode,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type { ProjectSourceCatalogSnapshot } from "../domain/project-source-index.types.js";
import type {
  ExtractSourceSymbolsInput,
  PublishProjectSymbolIndexInput,
  SourceSymbolExtractionResult,
} from "../domain/project-symbol-index.types.js";
import {
  ProjectNotFoundError,
  ProjectSourceCatalogRequiredError,
  ProjectSourceCatalogStaleError,
  ProjectSymbolIndexFailedError,
} from "../domain/project.errors.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import { ProjectSymbolIndexService } from "./project-symbol-index.service.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";
import type { SourceSymbolExtractor } from "./source-symbol.extractor.js";
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
  totalBytes: 32,
};

const sourceIndex: ProjectSourceIndex = {
  completedAt: "2026-07-27T10:01:00.000Z",
  errorCode: null,
  id: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  inspectedBytes: 32,
  inventoryScanId: inventoryScan.id,
  limitReasons: [],
  projectId: project.id,
  readyBytes: 32,
  readyFileCount: 2,
  skippedFileCount: 0,
  startedAt: "2026-07-27T10:00:00.000Z",
  status: "completed",
};

const sourceHash = "d86d567934dd8e2c168cdb89ea6fd7f048b244452d8c887b73d5941b982719cf";
const typescriptSourceFile = {
  contentHash: sourceHash,
  id: "ac871053-d9f1-4f28-b022-1a18079927bb",
  language: "typescript",
  modifiedAt: "2026-07-27T09:30:00.000Z",
  relativePath: "src/main.ts",
  sizeBytes: 27,
};
const markdownSourceFile = {
  contentHash: "b7e23ec29af22b0b4e41da31e868d57226121c84f60c0f986ce5cb473899ce7",
  id: "83107b40-6495-455f-a557-b64b29ef6af1",
  language: "markdown",
  modifiedAt: "2026-07-27T09:30:00.000Z",
  relativePath: "README.md",
  sizeBytes: 5,
};
const sourceCatalog: ProjectSourceCatalogSnapshot = {
  files: [typescriptSourceFile, markdownSourceFile],
  run: sourceIndex,
};

const runningSymbolIndex: ProjectSymbolIndex = {
  completedAt: null,
  errorCode: null,
  failedFileCount: 0,
  id: "bfcd6c71-f627-45cb-b133-65cf2e129f13",
  limitReasons: [],
  omittedSymbolCount: 0,
  parsedFileCount: 0,
  projectId: project.id,
  reusedFileCount: 0,
  sourceIndexRunId: sourceIndex.id,
  startedAt: "2026-07-27T11:00:00.000Z",
  status: "running",
  symbolCount: 0,
  unsupportedFileCount: 0,
};

function createFixture(
  options: {
    readonly currentFiles?: Awaited<ReturnType<ProjectSymbolIndexRepository["getCurrentFiles"]>>;
    readonly inventory?: ProjectScan | null;
    readonly parserIdentityError?: Error;
    readonly projectResult?: Project | null;
    readonly publishError?: Error;
    readonly sourceCatalog?: ProjectSourceCatalogSnapshot | null;
    readonly sourceHash?: string;
  } = {},
) {
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
  const getCurrentReadyCatalog = vi.fn(() =>
    Promise.resolve(options.sourceCatalog === undefined ? sourceCatalog : options.sourceCatalog),
  );
  const sourceIndexRepository = {
    beginIndex: vi.fn(),
    completeIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(sourceIndex)),
    getCurrentReadyCatalog,
    getLatestRun: vi.fn(() => Promise.resolve(sourceIndex)),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSourceIndexRepository;
  const beginIndex = vi.fn(() => Promise.resolve(runningSymbolIndex));
  const publishIndex = vi.fn((input: PublishProjectSymbolIndexInput) =>
    options.publishError === undefined
      ? Promise.resolve({
          ...runningSymbolIndex,
          completedAt: "2026-07-27T11:01:00.000Z",
          failedFileCount: input.failedFileCount,
          limitReasons: [...input.limitReasons],
          omittedSymbolCount: input.omittedSymbolCount,
          parsedFileCount: input.parsedFileCount,
          reusedFileCount: input.reusedFileCount,
          status: input.limitReasons.length === 0 ? ("completed" as const) : ("limited" as const),
          symbolCount: input.symbolCount,
          unsupportedFileCount: input.unsupportedFileCount,
        })
      : Promise.reject(options.publishError),
  );
  const failIndex = vi.fn(
    ({ errorCode }: { readonly errorCode: ProjectSymbolIndexErrorCode }): Promise<ProjectSymbolIndex> =>
      Promise.resolve({
        ...runningSymbolIndex,
        completedAt: "2026-07-27T11:01:00.000Z",
        errorCode,
        status: "failed",
      }),
  );
  const symbolIndexRepository = {
    beginIndex,
    failIndex,
    getCurrentCatalogRun: vi.fn(() =>
      Promise.resolve({
        ...runningSymbolIndex,
        completedAt: "2026-07-27T11:01:00.000Z",
        status: "completed" as const,
      }),
    ),
    getCurrentFiles: vi.fn(() => Promise.resolve(options.currentFiles ?? [])),
    getLatestRun: vi.fn(() => Promise.resolve(runningSymbolIndex)),
    listCatalogSymbols: vi.fn(),
    publishIndex,
    recoverInterruptedIndexes: vi.fn(() => Promise.resolve(0)),
  } satisfies ProjectSymbolIndexRepository;
  const inspect = vi.fn(() =>
    Promise.resolve({
      content: "export class ArcService {}",
      contentHash: options.sourceHash ?? sourceHash,
      inspectedBytes: 27,
      modifiedAt: "2026-07-27T09:30:00.000Z",
      sizeBytes: 27,
      status: "ready" as const,
    }),
  );
  const sourceTextReader = { inspect } satisfies SourceTextReader;
  const extract = vi.fn((input: ExtractSourceSymbolsInput): SourceSymbolExtractionResult => ({
    hasSyntaxErrors: false,
    limitReasons: [],
    omittedSymbolCount: 0,
    parserIdentity: "tree-sitter/typescript/query@1",
    symbols: [
      {
        exported: true,
        identityKey: "a".repeat(64),
        kind: "class",
        name: "ArcService",
        parentIdentityKey: null,
        qualifiedName: "ArcService",
        range: {
          endByte: input.source.length,
          endColumnByte: input.source.length,
          endLine: 0,
          startByte: 0,
          startColumnByte: 0,
          startLine: 0,
        },
      },
    ],
  }));
  const symbolExtractor = {
    extract,
    getParserIdentity: vi.fn(() => {
      if (options.parserIdentityError !== undefined) {
        throw options.parserIdentityError;
      }
      return "tree-sitter/typescript/query@1";
    }),
    supports: (language: string): language is "typescript" => language === "typescript",
  } satisfies SourceSymbolExtractor;
  const config = loadConfig({
    ARC_PROJECT_SYMBOL_BATCH_SIZE: "2",
    ARC_PROJECT_SYMBOL_MAX_SYMBOLS_PER_FILE: "2",
    ARC_PROJECT_SYMBOL_MAX_TOTAL_SYMBOLS: "3",
    ARC_PROJECT_SYMBOL_YIELD_EVERY_FILES: "1",
  });
  const service = new ProjectSymbolIndexService(
    projectRepository,
    inventoryRepository,
    sourceIndexRepository,
    symbolIndexRepository,
    sourceTextReader,
    symbolExtractor,
    config,
  );

  return {
    beginIndex,
    extract,
    failIndex,
    getCurrentReadyCatalog,
    inspect,
    publishIndex,
    service,
    symbolIndexRepository,
  };
}

describe("ProjectSymbolIndexService", () => {
  it("parses supported files, records unsupported files, and never persists source text", async () => {
    const fixture = createFixture();

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      parsedFileCount: 1,
      status: "completed",
      symbolCount: 1,
      unsupportedFileCount: 1,
    });
    expect(fixture.inspect).toHaveBeenCalledOnce();
    expect(fixture.extract).toHaveBeenCalledOnce();
    expect(fixture.publishIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            relativePath: "src/main.ts",
            status: "parsed",
            symbolCount: 1,
          }),
          expect.objectContaining({
            errorCode: "unsupported_language",
            relativePath: "README.md",
            status: "unsupported",
          }),
        ],
        sourceIndexRunId: sourceIndex.id,
      }),
    );
    expect(fixture.publishIndex.mock.calls[0]?.[0]).not.toHaveProperty("content");
    expect(fixture.publishIndex.mock.calls[0]?.[0].files[0]).not.toHaveProperty("content");
  });

  it("reuses unchanged successful files without reading or parsing them", async () => {
    const parserIdentity = "tree-sitter/typescript/query@1/symbols=2/name=512/qualified=2048";
    const fixture = createFixture({
      currentFiles: [
        {
          hasSyntaxErrors: false,
          language: "typescript",
          omittedSymbolCount: 0,
          parserIdentity,
          sourceContentHash: sourceHash,
          sourceFileId: typescriptSourceFile.id,
          status: "parsed",
          symbolCount: 1,
        },
        {
          hasSyntaxErrors: false,
          language: "markdown",
          omittedSymbolCount: 0,
          parserIdentity: "unsupported:markdown",
          sourceContentHash: markdownSourceFile.contentHash,
          sourceFileId: markdownSourceFile.id,
          status: "unsupported",
          symbolCount: 0,
        },
      ],
    });

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      reusedFileCount: 2,
      symbolCount: 1,
      unsupportedFileCount: 1,
    });
    expect(fixture.inspect).not.toHaveBeenCalled();
    expect(fixture.extract).not.toHaveBeenCalled();
    expect(fixture.publishIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [],
        reusedSourceFileIds: sourceCatalog.files.map((file) => file.id),
      }),
    );
  });

  it("removes prior symbols through a durable failed-file outcome when the source hash changed", async () => {
    const fixture = createFixture({ sourceHash: "c".repeat(64) });

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      failedFileCount: 1,
      symbolCount: 0,
    });
    expect(fixture.extract).not.toHaveBeenCalled();
    expect(fixture.publishIndex.mock.calls[0]?.[0].files).toContainEqual(
      expect.objectContaining({
        errorCode: "source_changed",
        status: "failed",
        symbols: [],
      }),
    );
  });

  it("stops parsing supported files at the total-symbol limit and publishes a limited run", async () => {
    const sourceFileIds = [
      "ac871053-d9f1-4f28-b022-1a18079927bb",
      "83107b40-6495-455f-a557-b64b29ef6af1",
      "0b9cf292-49fb-4c7e-b0c7-48c720129bd9",
      "aa8c509b-e1ac-408c-9e4c-c5093a0f4508",
    ];
    const fixture = createFixture({
      sourceCatalog: {
        files: sourceFileIds.map((id, index) => ({
          contentHash: sourceHash,
          id,
          language: "typescript",
          modifiedAt: "2026-07-27T09:30:00.000Z",
          relativePath: `src/file-${String(index)}.ts`,
          sizeBytes: 27,
        })),
        run: sourceIndex,
      },
    });

    await expect(fixture.service.index(project.id)).resolves.toMatchObject({
      limitReasons: ["total_symbols"],
      parsedFileCount: 3,
      status: "limited",
      symbolCount: 3,
    });
    expect(fixture.extract).toHaveBeenCalledTimes(3);
    expect(fixture.publishIndex.mock.calls[0]?.[0].files).toContainEqual(
      expect.objectContaining({
        errorCode: "symbol_limit",
        relativePath: "src/file-3.ts",
        status: "limited",
        symbols: [],
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

  it("records parser and persistence failures without publishing a partial catalog", async () => {
    const parserFailure = createFixture({ parserIdentityError: new Error("native binding unavailable") });
    await expect(parserFailure.service.index(project.id)).rejects.toBeInstanceOf(ProjectSymbolIndexFailedError);
    expect(parserFailure.failIndex).toHaveBeenCalledWith({
      errorCode: "parser_unavailable",
      projectId: project.id,
      symbolIndexId: runningSymbolIndex.id,
    });
    expect(parserFailure.publishIndex).not.toHaveBeenCalled();

    const persistenceFailure = createFixture({ publishError: new Error("database unavailable") });
    await expect(persistenceFailure.service.index(project.id)).rejects.toBeInstanceOf(ProjectSymbolIndexFailedError);
    expect(persistenceFailure.failIndex).toHaveBeenCalledWith({
      errorCode: "symbol_persistence_error",
      projectId: project.id,
      symbolIndexId: runningSymbolIndex.id,
    });
  });

  it("reports symbol-catalog freshness independently from the latest run and recovers interrupted runs", async () => {
    const fixture = createFixture();
    fixture.symbolIndexRepository.getLatestRun = vi.fn(() =>
      Promise.resolve({
        ...runningSymbolIndex,
        completedAt: "2026-07-27T11:02:00.000Z",
        errorCode: "index_interrupted",
        status: "failed",
      }),
    );

    await expect(fixture.service.getLatest(project.id)).resolves.toMatchObject({
      currentCatalog: {
        stale: false,
        symbolIndexId: runningSymbolIndex.id,
      },
      latestRun: {
        errorCode: "index_interrupted",
        status: "failed",
      },
    });

    fixture.symbolIndexRepository.recoverInterruptedIndexes = vi.fn(() => Promise.resolve(2));
    await expect(fixture.service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(fixture.symbolIndexRepository.recoverInterruptedIndexes).toHaveBeenCalledOnce();
  });
});
