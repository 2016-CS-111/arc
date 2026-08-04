import { describe, expect, it } from "vitest";

import {
  LatestProjectEmbeddingIndexResponseSchema,
  ProjectEmbeddingIndexSchema,
} from "./project-embedding-index.contract.js";

const index = {
  id: "00000000-0000-4000-8000-000000000010",
  projectId: "00000000-0000-4000-8000-000000000001",
  sourceIndexRunId: "00000000-0000-4000-8000-000000000003",
  symbolIndexRunId: "00000000-0000-4000-8000-000000000004",
  dependencyIndexRunId: "00000000-0000-4000-8000-000000000005",
  frameworkIndexRunId: "00000000-0000-4000-8000-000000000006",
  status: "completed",
  provider: "ollama",
  model: "bge-m3",
  dimensions: 1_024,
  inputFormat: "arc-source-v1+plain-v1",
  chunkerIdentity: "arc-source-chunker-v1",
  fileCount: 1,
  chunkCount: 2,
  embeddedChunkCount: 1,
  reusedChunkCount: 1,
  limitReasons: [],
  errorCode: null,
  startedAt: "2026-07-29T10:00:00.000Z",
  completedAt: "2026-07-29T10:01:00.000Z",
} as const;

describe("project embedding index contract", () => {
  it("accepts a completed current catalog", () => {
    expect(ProjectEmbeddingIndexSchema.parse(index)).toEqual(index);
    expect(
      LatestProjectEmbeddingIndexResponseSchema.parse({
        latestRun: index,
        currentCatalog: { ...index, stale: false },
      }),
    ).toMatchObject({ currentCatalog: { stale: false } });
  });
});
