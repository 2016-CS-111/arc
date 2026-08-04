import type { ProjectSemanticSearchResponse } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type { ProjectSemanticSearchService } from "../../projects/application/project-semantic-search.service.js";
import type { ProjectSourceRangeService } from "../../projects/application/project-source-range.service.js";
import { ProjectEmbeddingCatalogStaleError } from "../../projects/domain/project.errors.js";
import { ChatTokenBudgetService } from "./chat-token-budget.service.js";
import { ProjectChatContextService } from "./project-chat-context.service.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const sourceIndexRunId = "00000000-0000-4000-8000-000000000002";

function createSearchResponse(): ProjectSemanticSearchResponse {
  return {
    candidateLimit: 20,
    catalogLimited: false,
    dependencyIndexRunId: "00000000-0000-4000-8000-000000000003",
    dimensions: 1_024,
    embeddingIndexId: "00000000-0000-4000-8000-000000000004",
    frameworkIndexRunId: "00000000-0000-4000-8000-000000000005",
    limit: 12,
    model: "bge-m3",
    projectId,
    ranking: "rrf-v1",
    results: [],
    rrfK: 60,
    sourceIndexRunId,
    symbolIndexRunId: "00000000-0000-4000-8000-000000000006",
    truncated: false,
  };
}

function createHarness() {
  const search = vi.fn(() => Promise.resolve(createSearchResponse()));
  const rehydrate = vi.fn(() =>
    Promise.resolve({
      omissionReasons: {},
      omittedCount: 0,
      selectedBytes: 24,
      snippets: [
        {
          chunkId: "00000000-0000-4000-8000-000000000007",
          content: "export const answer = 42;\n",
          endLine: 4,
          language: "typescript",
          relativePath: "src/answer.ts",
          sizeBytes: 24,
          startLine: 3,
          symbolName: "answer",
        },
      ],
      status: "ready" as const,
    }),
  );
  const config = loadConfig({});
  const service = new ProjectChatContextService(
    config,
    { search } as unknown as ProjectSemanticSearchService,
    { rehydrate } as unknown as ProjectSourceRangeService,
    new ChatTokenBudgetService(config),
  );

  return { rehydrate, search, service };
}

describe("ProjectChatContextService", () => {
  it("searches, rehydrates, and formats bounded untrusted project context", async () => {
    const harness = createHarness();
    const signal = new AbortController().signal;

    const result = await harness.service.select(
      {
        projectId,
        query: "Where is the answer?",
        tokenLimit: 512,
      },
      signal,
    );

    expect(harness.search).toHaveBeenCalledWith(
      projectId,
      {
        languages: [],
        limit: 12,
        query: "Where is the answer?",
      },
      signal,
    );
    expect(harness.rehydrate).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSnippetBytes: 8_192,
        projectId,
        sourceIndexRunId,
      }),
    );
    expect(result).toMatchObject({
      selectedCount: 1,
    });
    expect(result.content).toContain("src/answer.ts");
    expect(result.content).toContain("export const answer = 42;");
  });

  it("falls back with a safe reason when retrieval is stale", async () => {
    const harness = createHarness();
    harness.search.mockRejectedValueOnce(new ProjectEmbeddingCatalogStaleError(projectId));

    await expect(
      harness.service.select(
        {
          projectId,
          query: "Where is the answer?",
          tokenLimit: 512,
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      content: null,
      reason: "embedding_catalog_stale",
    });
    expect(harness.rehydrate).not.toHaveBeenCalled();
  });
});
