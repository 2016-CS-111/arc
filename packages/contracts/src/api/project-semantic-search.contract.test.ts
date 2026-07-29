import { describe, expect, it } from "vitest";

import {
  ProjectSemanticSearchRequestSchema,
  ProjectSemanticSearchResponseSchema,
} from "./project-semantic-search.contract.js";

const ids = {
  project: "00000000-0000-4000-8000-000000000001",
  source: "00000000-0000-4000-8000-000000000003",
  symbol: "00000000-0000-4000-8000-000000000004",
  dependency: "00000000-0000-4000-8000-000000000005",
  framework: "00000000-0000-4000-8000-000000000006",
  sourceFile: "00000000-0000-4000-8000-000000000007",
  embedding: "00000000-0000-4000-8000-000000000010",
  chunk: "00000000-0000-4000-8000-000000000011",
} as const;

describe("project semantic search contract", () => {
  it("applies compact search defaults and bounds", () => {
    expect(ProjectSemanticSearchRequestSchema.parse({ query: "  find registration  " })).toEqual({
      query: "find registration",
      languages: [],
      limit: 10,
    });
    expect(ProjectSemanticSearchRequestSchema.safeParse({ query: "", limit: 51 }).success).toBe(false);
  });

  it("accepts ranked metadata without source or vector payloads", () => {
    const response = ProjectSemanticSearchResponseSchema.parse({
      projectId: ids.project,
      embeddingIndexId: ids.embedding,
      sourceIndexRunId: ids.source,
      symbolIndexRunId: ids.symbol,
      dependencyIndexRunId: ids.dependency,
      frameworkIndexRunId: ids.framework,
      model: "bge-m3",
      dimensions: 1_024,
      catalogLimited: false,
      ranking: "rrf-v1",
      rrfK: 60,
      candidateLimit: 40,
      limit: 10,
      truncated: false,
      results: [
        {
          chunkId: ids.chunk,
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
          rank: 1,
          score: 2 / 61,
          denseRank: 1,
          denseScore: 0.95,
          lexicalRank: 1,
          lexicalScore: 0.8,
          embedding: [1, 0, 0],
          sourceText: "private source",
        },
      ],
    });

    expect(response.results[0]).toMatchObject({
      rank: 1,
      denseRank: 1,
      lexicalRank: 1,
    });
    expect(response.results[0]).not.toHaveProperty("embedding");
    expect(response.results[0]).not.toHaveProperty("sourceText");
  });
});
