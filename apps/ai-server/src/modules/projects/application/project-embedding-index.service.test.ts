import type {
  Project,
  ProjectDependencyIndex,
  ProjectEmbeddingIndex,
  ProjectFrameworkIndex,
  ProjectSourceIndex,
  ProjectSymbolIndex,
} from "@arc/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type { EmbeddingModelPort } from "../../embeddings/application/embedding-model.port.js";
import type { EmbeddingModelRequest } from "../../embeddings/domain/embedding-model.types.js";
import type {
  ProjectEmbeddingIndexRepository,
  PublishProjectEmbeddingIndexInput,
} from "../domain/project-embedding-index.types.js";
import type { ProjectSourceChunk } from "../domain/project-source-chunk.types.js";
import type { ProjectSourceCatalogSnapshot } from "../domain/project-source-index.types.js";
import type { ProjectFrameworkIndexRepository } from "../domain/project-framework-index.types.js";
import { ProjectEmbeddingIndexFailedError } from "../domain/project.errors.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectEmbeddingIndexService } from "./project-embedding-index.service.js";
import type { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceChunker } from "./project-source-chunker.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";

const ids = {
  project: "00000000-0000-4000-8000-000000000001",
  inventory: "00000000-0000-4000-8000-000000000002",
  source: "00000000-0000-4000-8000-000000000003",
  symbol: "00000000-0000-4000-8000-000000000004",
  dependency: "00000000-0000-4000-8000-000000000005",
  framework: "00000000-0000-4000-8000-000000000006",
  sourceFile: "00000000-0000-4000-8000-000000000007",
  embedding: "00000000-0000-4000-8000-000000000010",
} as const;
const timestamp = "2026-07-29T10:00:00.000Z";
const project: Project = {
  id: ids.project,
  name: "fixture",
  rootPath: "/workspace",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const sourceRun: ProjectSourceIndex = {
  id: ids.source,
  projectId: ids.project,
  inventoryScanId: ids.inventory,
  status: "completed",
  readyFileCount: 1,
  skippedFileCount: 0,
  inspectedBytes: 10,
  readyBytes: 10,
  limitReasons: [],
  errorCode: null,
  startedAt: timestamp,
  completedAt: timestamp,
};
const symbolRun: ProjectSymbolIndex = {
  id: ids.symbol,
  projectId: ids.project,
  sourceIndexRunId: ids.source,
  status: "completed",
  parsedFileCount: 1,
  reusedFileCount: 0,
  unsupportedFileCount: 0,
  failedFileCount: 0,
  symbolCount: 0,
  omittedSymbolCount: 0,
  limitReasons: [],
  errorCode: null,
  startedAt: timestamp,
  completedAt: timestamp,
};
const dependencyRun: ProjectDependencyIndex = {
  id: ids.dependency,
  projectId: ids.project,
  sourceIndexRunId: ids.source,
  status: "completed",
  resolutionContextHash: "a".repeat(64),
  parsedFileCount: 1,
  reusedFileCount: 0,
  unsupportedFileCount: 0,
  failedFileCount: 0,
  edgeCount: 0,
  bindingCount: 0,
  omittedEdgeCount: 0,
  omittedBindingCount: 0,
  localEdgeCount: 0,
  externalEdgeCount: 0,
  builtinEdgeCount: 0,
  unresolvedEdgeCount: 0,
  limitReasons: [],
  resolverWarnings: [],
  errorCode: null,
  startedAt: timestamp,
  completedAt: timestamp,
};
const frameworkRun: ProjectFrameworkIndex = {
  id: ids.framework,
  projectId: ids.project,
  sourceIndexRunId: ids.source,
  symbolIndexRunId: ids.symbol,
  dependencyIndexRunId: ids.dependency,
  status: "completed",
  analyzerSetIdentity: "b".repeat(64),
  scopeCount: 0,
  analyzedFileCount: 1,
  reusedFileCount: 0,
  unsupportedFileCount: 0,
  failedFileCount: 0,
  entityCount: 0,
  relationshipCount: 0,
  unresolvedRelationshipCount: 0,
  omissionCount: 0,
  limitReasons: [],
  warnings: [],
  errorCode: null,
  startedAt: timestamp,
  completedAt: timestamp,
};
const sourceCatalog: ProjectSourceCatalogSnapshot = {
  run: sourceRun,
  files: [
    {
      id: ids.sourceFile,
      contentHash: "c".repeat(64),
      language: "typescript",
      modifiedAt: timestamp,
      relativePath: "src/example.ts",
      sizeBytes: 10,
    },
  ],
};
const runningIndex: ProjectEmbeddingIndex = {
  id: ids.embedding,
  projectId: ids.project,
  sourceIndexRunId: ids.source,
  symbolIndexRunId: ids.symbol,
  dependencyIndexRunId: ids.dependency,
  frameworkIndexRunId: ids.framework,
  status: "running",
  provider: "ollama",
  model: "bge-m3",
  dimensions: 1_024,
  inputFormat: "arc-source-v1+plain-v1",
  chunkerIdentity: "arc-source-chunker-v1",
  fileCount: 0,
  chunkCount: 0,
  embeddedChunkCount: 0,
  reusedChunkCount: 0,
  limitReasons: [],
  errorCode: null,
  startedAt: timestamp,
  completedAt: null,
};

function createChunk(identity: string, input: string): ProjectSourceChunk {
  return {
    identityKey: identity.repeat(64),
    inputFormat: "arc-source-v1",
    inputHash: `${identity}input`.padEnd(64, identity),
    contentHash: `${identity}content`.padEnd(64, identity),
    embeddingInput: input,
    language: "typescript",
    ordinal: 0,
    owner: null,
    range: {
      startByte: 0,
      endByte: 10,
      startLine: 0,
      startColumnByte: 0,
      endLine: 0,
      endColumnByte: 10,
    },
    relativePath: "src/example.ts",
    sourceBytes: 10,
    sourceFileId: ids.sourceFile,
    sourceHash: "c".repeat(64),
  };
}

interface HarnessOptions {
  readonly chunks?: readonly ProjectSourceChunk[];
  readonly current?: ProjectEmbeddingIndex | null;
  readonly reusable?: readonly {
    readonly identityKey: string;
    readonly inputHash: string;
    readonly embedding: readonly number[];
  }[];
  readonly publishError?: Error;
}

function createHarness(options: HarnessOptions = {}) {
  const chunks = options.chunks ?? [createChunk("a", "private source")];
  const publishIndex = vi.fn((input: PublishProjectEmbeddingIndexInput) => {
    if (options.publishError !== undefined) {
      return Promise.reject(options.publishError);
    }
    return Promise.resolve({
      ...runningIndex,
      status: input.limitReasons.length === 0 ? ("completed" as const) : ("limited" as const),
      fileCount: input.files.length,
      chunkCount: input.files.reduce((sum, file) => sum + file.chunks.length, 0),
      embeddedChunkCount: input.embeddedChunkCount,
      reusedChunkCount: input.reusedChunkCount,
      limitReasons: [...input.limitReasons],
      completedAt: timestamp,
    });
  });
  const failIndex = vi.fn(() =>
    Promise.resolve({
      ...runningIndex,
      status: "failed" as const,
      errorCode: "embedding_persistence_error" as const,
      completedAt: timestamp,
    }),
  );
  const embeddingRepository = {
    beginIndex: vi.fn(() => Promise.resolve(runningIndex)),
    failIndex,
    findReusableChunks: vi.fn(() => Promise.resolve(options.reusable ?? [])),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(options.current ?? null)),
    getLatestRun: vi.fn(() => Promise.resolve(options.current ?? null)),
    publishIndex,
    recoverInterruptedIndexes: vi.fn(() => Promise.resolve(0)),
    searchSemantic: vi.fn(() => Promise.resolve([])),
    searchMetadata: vi.fn(() => Promise.resolve([])),
  } satisfies ProjectEmbeddingIndexRepository;
  const sourceRepository = {
    getCurrentReadyCatalog: vi.fn(() => Promise.resolve(sourceCatalog)),
    getLatestRun: vi.fn(() => Promise.resolve(sourceRun)),
  } as unknown as ProjectSourceIndexRepository;
  const symbolRepository = {
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(symbolRun)),
    getLatestRun: vi.fn(() => Promise.resolve(symbolRun)),
    listCatalogSymbols: vi.fn(() => Promise.resolve({ hasMore: false, symbols: [] })),
  } as unknown as ProjectSymbolIndexRepository;
  const dependencyRepository = {
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(dependencyRun)),
    getLatestRun: vi.fn(() => Promise.resolve(dependencyRun)),
  } as unknown as ProjectDependencyIndexRepository;
  const frameworkRepository = {
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(frameworkRun)),
    getLatestRun: vi.fn(() => Promise.resolve(frameworkRun)),
  } as unknown as ProjectFrameworkIndexRepository;
  const embeddingModel = {
    getStatus: vi.fn(() =>
      Promise.resolve({
        status: "ready" as const,
        model: "bge-m3",
        dimensions: 1_024,
        latencyMs: 1,
      }),
    ),
    embed: vi.fn((request: EmbeddingModelRequest) =>
      Promise.resolve({
        provider: "ollama" as const,
        model: "bge-m3",
        dimensions: 1_024,
        inputFormat: "plain-v1" as const,
        vectors: request.inputs.map((_, index) => [index + 1, 0, 0]),
      }),
    ),
  } satisfies EmbeddingModelPort;
  const ignorePolicy = {
    createEvaluator: vi.fn(() => ({
      check: vi.fn(() =>
        Promise.resolve({
          ignored: false,
          kind: "file" as const,
          path: "src/example.ts",
          projectId: ids.project,
          reason: { source: "none" as const, sourcePath: null, pattern: null },
        }),
      ),
    })),
  } as unknown as ProjectIgnorePolicyService;
  const sourceChunker = {
    chunk: vi.fn(() =>
      Promise.resolve({
        chunkerIdentity: "arc-source-chunker-v1" as const,
        chunks,
        truncated: false,
      }),
    ),
  } as unknown as ProjectSourceChunker;
  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(project)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const config = loadConfig({
    NODE_ENV: "test",
    ARC_OLLAMA_EMBEDDING_MODEL: "bge-m3",
    ARC_PROJECT_EMBEDDING_BATCH_SIZE: "2",
  });

  return {
    embeddingModel,
    embeddingRepository,
    failIndex,
    publishIndex,
    service: new ProjectEmbeddingIndexService(
      projectRepository,
      sourceRepository,
      symbolRepository,
      dependencyRepository,
      frameworkRepository,
      embeddingRepository,
      embeddingModel,
      ignorePolicy,
      sourceChunker,
      config,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectEmbeddingIndexService", () => {
  it("returns an already-current catalog without contacting Ollama", async () => {
    const current = { ...runningIndex, status: "completed" as const, completedAt: timestamp };
    const harness = createHarness({ current });

    await expect(harness.service.index(ids.project)).resolves.toEqual(current);
    expect(harness.embeddingModel.getStatus).not.toHaveBeenCalled();
    expect(harness.embeddingModel.embed).not.toHaveBeenCalled();
    expect(harness.embeddingRepository.beginIndex).not.toHaveBeenCalled();
  });

  it("reuses matching vectors and embeds only missing chunks", async () => {
    const first = createChunk("a", "private source one");
    const second = createChunk("b", "private source two");
    const harness = createHarness({
      chunks: [first, second],
      reusable: [{ identityKey: first.identityKey, inputHash: first.inputHash, embedding: [9, 0, 0] }],
    });

    await harness.service.index(ids.project);

    expect(harness.embeddingModel.embed).toHaveBeenCalledWith({
      purpose: "document",
      inputs: ["private source two"],
    });
    const publication = harness.publishIndex.mock.calls[0]?.[0];
    expect(publication).toMatchObject({ embeddedChunkCount: 1, reusedChunkCount: 1 });
    expect(publication?.files[0]?.chunks.map((chunk) => chunk.embedding)).toEqual([
      [9, 0, 0],
      [1, 0, 0],
    ]);
    expect(JSON.stringify(publication)).not.toContain("private source");
  });

  it("records publication failure without replacing the current catalog", async () => {
    const harness = createHarness({ publishError: new Error("database unavailable") });

    await expect(harness.service.index(ids.project)).rejects.toBeInstanceOf(ProjectEmbeddingIndexFailedError);
    expect(harness.failIndex).toHaveBeenCalledWith(ids.project, ids.embedding, "embedding_persistence_error");
  });

  it("recovers interrupted runs during application bootstrap", async () => {
    const harness = createHarness();
    harness.embeddingRepository.recoverInterruptedIndexes.mockResolvedValueOnce(2);

    await harness.service.onApplicationBootstrap();

    expect(harness.embeddingRepository.recoverInterruptedIndexes).toHaveBeenCalledOnce();
  });
});
