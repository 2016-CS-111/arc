import type { ProjectEmbeddingCatalogStatus } from "@arc/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EmbeddingModelPort } from "../../embeddings/application/embedding-model.port.js";
import type { ProjectEmbeddingIndexRepository } from "../domain/project-embedding-index.types.js";
import type { ProjectSemanticSearchRecord } from "../domain/project-semantic-search.types.js";
import { ProjectEmbeddingCatalogRequiredError, ProjectEmbeddingCatalogStaleError } from "../domain/project.errors.js";
import type { ProjectEmbeddingIndexService } from "./project-embedding-index.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import { ProjectSemanticSearchService } from "./project-semantic-search.service.js";

const ids = {
  project: "00000000-0000-4000-8000-000000000001",
  source: "00000000-0000-4000-8000-000000000003",
  symbol: "00000000-0000-4000-8000-000000000004",
  dependency: "00000000-0000-4000-8000-000000000005",
  framework: "00000000-0000-4000-8000-000000000006",
  sourceFile: "00000000-0000-4000-8000-000000000007",
  embedding: "00000000-0000-4000-8000-000000000010",
  nextEmbedding: "00000000-0000-4000-8000-000000000012",
} as const;
const timestamp = "2026-07-29T10:00:00.000Z";
const catalog: ProjectEmbeddingCatalogStatus = {
  id: ids.embedding,
  projectId: ids.project,
  sourceIndexRunId: ids.source,
  symbolIndexRunId: ids.symbol,
  dependencyIndexRunId: ids.dependency,
  frameworkIndexRunId: ids.framework,
  status: "completed",
  provider: "ollama",
  model: "bge-m3",
  dimensions: 1_024,
  inputFormat: "arc-source-v1+plain-v1",
  chunkerIdentity: "arc-source-chunker-v1",
  fileCount: 1,
  chunkCount: 2,
  embeddedChunkCount: 2,
  reusedChunkCount: 0,
  limitReasons: [],
  errorCode: null,
  startedAt: timestamp,
  completedAt: timestamp,
  stale: false,
};

function createRecord(chunkId: string, score: number): ProjectSemanticSearchRecord {
  return {
    chunkId,
    identityKey: "a".repeat(64),
    sourceFileId: ids.sourceFile,
    path: "src/example.ts",
    language: "typescript",
    sourceHash: "b".repeat(64),
    contentHash: "c".repeat(64),
    range: {
      startByte: 0,
      endByte: 10,
      startLine: 0,
      startColumnByte: 0,
      endLine: 0,
      endColumnByte: 10,
    },
    symbol: null,
    score,
  };
}

function createHarness(catalogs: readonly (ProjectEmbeddingCatalogStatus | null)[] = [catalog, catalog]) {
  const getLatest = vi.fn();
  for (const currentCatalog of catalogs) {
    getLatest.mockResolvedValueOnce({
      latestRun: currentCatalog,
      currentCatalog,
    });
  }
  const searchSemantic = vi.fn(() =>
    Promise.resolve([
      createRecord("00000000-0000-4000-8000-000000000020", 0.95),
      createRecord("00000000-0000-4000-8000-000000000021", 0.9),
    ]),
  );
  const embeddingModel = {
    getStatus: vi.fn(),
    embed: vi.fn(() =>
      Promise.resolve({
        provider: "ollama" as const,
        model: "bge-m3",
        dimensions: 1_024,
        inputFormat: "plain-v1" as const,
        vectors: [[1, 0, 0]],
      }),
    ),
  } satisfies EmbeddingModelPort;
  const repository = { searchSemantic } as unknown as ProjectEmbeddingIndexRepository;
  const service = new ProjectSemanticSearchService(
    { getLatest } as unknown as ProjectEmbeddingIndexService,
    repository,
    embeddingModel,
    new ProjectPathNormalizer(),
  );

  return { embeddingModel, searchSemantic, service };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectSemanticSearchService", () => {
  it("embeds the query and returns bounded ranked metadata", async () => {
    const harness = createHarness();
    const response = await harness.service.search(ids.project, {
      query: "private registration question",
      pathPrefix: "src//services",
      languages: ["typescript"],
      limit: 1,
    });

    expect(harness.embeddingModel.embed).toHaveBeenCalledWith({
      purpose: "query",
      inputs: ["private registration question"],
    });
    expect(harness.searchSemantic).toHaveBeenCalledWith({
      projectId: ids.project,
      embeddingIndexId: ids.embedding,
      embedding: [1, 0, 0],
      pathPrefix: "src/services",
      languages: ["typescript"],
      limit: 1,
    });
    expect(response).toMatchObject({
      embeddingIndexId: ids.embedding,
      limit: 1,
      truncated: true,
      results: [{ rank: 1, score: 0.95 }],
    });
    expect(JSON.stringify(response)).not.toContain("private registration question");
    expect(JSON.stringify(response)).not.toContain("[1,0,0]");
  });

  it("requires an embedding catalog before contacting the model", async () => {
    const harness = createHarness([null]);

    await expect(
      harness.service.search(ids.project, { query: "find code", languages: [], limit: 10 }),
    ).rejects.toBeInstanceOf(ProjectEmbeddingCatalogRequiredError);
    expect(harness.embeddingModel.embed).not.toHaveBeenCalled();
  });

  it("rejects results when the catalog changes during the query", async () => {
    const harness = createHarness([catalog, { ...catalog, id: ids.nextEmbedding }]);

    await expect(
      harness.service.search(ids.project, { query: "find code", languages: [], limit: 10 }),
    ).rejects.toBeInstanceOf(ProjectEmbeddingCatalogStaleError);
  });
});
