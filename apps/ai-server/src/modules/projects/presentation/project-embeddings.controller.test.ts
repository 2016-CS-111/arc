import type { ProjectEmbeddingIndex } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import type { ProjectEmbeddingIndexService } from "../application/project-embedding-index.service.js";
import { ProjectEmbeddingsController } from "./project-embeddings.controller.js";

const index: ProjectEmbeddingIndex = {
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
  chunkCount: 1,
  embeddedChunkCount: 1,
  reusedChunkCount: 0,
  limitReasons: [],
  errorCode: null,
  startedAt: "2026-07-29T10:00:00.000Z",
  completedAt: "2026-07-29T10:01:00.000Z",
};

describe("ProjectEmbeddingsController", () => {
  it("returns the shared embedding index contract", async () => {
    const service = {
      index: () => Promise.resolve(index),
      getLatest: () => Promise.resolve({ latestRun: index, currentCatalog: { ...index, stale: false } }),
    } as ProjectEmbeddingIndexService;
    const controller = new ProjectEmbeddingsController(service);

    await expect(controller.index(index.projectId)).resolves.toEqual(index);
    await expect(controller.getLatest(index.projectId)).resolves.toMatchObject({
      currentCatalog: { stale: false },
    });
  });
});
