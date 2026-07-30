import { createHash } from "node:crypto";

import type { Project, ProjectSemanticSearchResult, ProjectSourceIndex } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ProjectSourceCatalogSnapshot } from "../domain/project-source-index.types.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import { ProjectSourceRangeService } from "./project-source-range.service.js";
import type { SourceTextReader } from "./source-text.reader.js";

const ids = {
  project: "00000000-0000-4000-8000-000000000001",
  inventory: "00000000-0000-4000-8000-000000000002",
  source: "00000000-0000-4000-8000-000000000003",
  sourceFile: "00000000-0000-4000-8000-000000000004",
  chunkOne: "00000000-0000-4000-8000-000000000005",
  chunkTwo: "00000000-0000-4000-8000-000000000006",
} as const;
const timestamp = "2026-07-29T10:00:00.000Z";
const content = "first line\nsecond café line\n";
const firstEnd = Buffer.byteLength("first line\n", "utf8");
const contentBytes = Buffer.from(content, "utf8");

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const project: Project = {
  createdAt: timestamp,
  id: ids.project,
  name: "fixture",
  rootPath: "/workspace",
  updatedAt: timestamp,
};
const sourceRun: ProjectSourceIndex = {
  completedAt: timestamp,
  errorCode: null,
  id: ids.source,
  inspectedBytes: contentBytes.length,
  inventoryScanId: ids.inventory,
  limitReasons: [],
  projectId: ids.project,
  readyBytes: contentBytes.length,
  readyFileCount: 1,
  skippedFileCount: 0,
  startedAt: timestamp,
  status: "completed",
};
const catalog: ProjectSourceCatalogSnapshot = {
  files: [
    {
      contentHash: hash(contentBytes),
      id: ids.sourceFile,
      language: "typescript",
      modifiedAt: timestamp,
      relativePath: "src/example.ts",
      sizeBytes: contentBytes.length,
    },
  ],
  run: sourceRun,
};

function createCandidate(
  chunkId: string,
  startByte: number,
  endByte: number,
  contentHash = hash(contentBytes.subarray(startByte, endByte)),
): ProjectSemanticSearchResult {
  return {
    chunkId,
    contentHash,
    denseRank: 1,
    denseScore: 0.9,
    identityKey: hash(chunkId),
    language: "typescript",
    lexicalRank: null,
    lexicalScore: null,
    path: "src/example.ts",
    range: {
      endByte,
      endColumnByte: 0,
      endLine: endByte === firstEnd ? 1 : 2,
      startByte,
      startColumnByte: 0,
      startLine: startByte === 0 ? 0 : 1,
    },
    rank: 1,
    score: 0.01,
    sourceFileId: ids.sourceFile,
    sourceHash: hash(contentBytes),
    symbol: null,
  };
}

function createHarness(selectedCatalog: ProjectSourceCatalogSnapshot | null = catalog) {
  const inspect = vi.fn(() =>
    Promise.resolve({
      content,
      contentHash: hash(contentBytes),
      inspectedBytes: contentBytes.length,
      modifiedAt: timestamp,
      sizeBytes: contentBytes.length,
      status: "ready" as const,
    }),
  );
  const service = new ProjectSourceRangeService(
    {
      findById: vi.fn(() => Promise.resolve(project)),
    } as unknown as ProjectRepository,
    {
      getCurrentReadyCatalog: vi.fn(() => Promise.resolve(selectedCatalog)),
    } as unknown as ProjectSourceIndexRepository,
    { inspect } satisfies SourceTextReader,
  );

  return { inspect, service };
}

describe("ProjectSourceRangeService", () => {
  it("rehydrates exact non-overlapping UTF-8 ranges with one source read", async () => {
    const harness = createHarness();

    const result = await harness.service.rehydrate({
      candidates: [
        createCandidate(ids.chunkOne, 0, firstEnd),
        createCandidate(ids.chunkTwo, firstEnd, contentBytes.length),
      ],
      maxSnippetBytes: 8_192,
      maxTotalBytes: 16_384,
      projectId: ids.project,
      sourceIndexRunId: ids.source,
    });

    expect(result).toMatchObject({
      omittedCount: 0,
      selectedBytes: contentBytes.length,
      status: "ready",
    });
    expect(result.snippets.map((snippet) => snippet.content)).toEqual(["first line\n", "second café line\n"]);
    expect(harness.inspect).toHaveBeenCalledTimes(1);
  });

  it("omits overlapping ranges and content hash mismatches", async () => {
    const harness = createHarness();

    const result = await harness.service.rehydrate({
      candidates: [
        createCandidate(ids.chunkOne, 0, firstEnd),
        createCandidate(ids.chunkTwo, 0, firstEnd),
        createCandidate("00000000-0000-4000-8000-000000000007", firstEnd, contentBytes.length, "0".repeat(64)),
      ],
      maxSnippetBytes: 8_192,
      maxTotalBytes: 16_384,
      projectId: ids.project,
      sourceIndexRunId: ids.source,
    });

    expect(result.snippets).toHaveLength(1);
    expect(result.omissionReasons).toEqual({
      content_hash_mismatch: 1,
      overlapping_range: 1,
    });
  });

  it("fails closed when the source catalog changed after search", async () => {
    const harness = createHarness({
      ...catalog,
      run: { ...sourceRun, id: "00000000-0000-4000-8000-000000000008" },
    });

    const result = await harness.service.rehydrate({
      candidates: [createCandidate(ids.chunkOne, 0, firstEnd)],
      maxSnippetBytes: 8_192,
      maxTotalBytes: 16_384,
      projectId: ids.project,
      sourceIndexRunId: ids.source,
    });

    expect(result).toMatchObject({
      omittedCount: 1,
      status: "unavailable",
      unavailableReason: "source_catalog_stale",
    });
    expect(harness.inspect).not.toHaveBeenCalled();
  });
});
