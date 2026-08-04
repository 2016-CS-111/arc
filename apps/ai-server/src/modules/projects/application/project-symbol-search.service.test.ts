import type { ProjectSymbolIndex } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";
import { ProjectSymbolSearchService } from "./project-symbol-search.service.js";

const catalog: ProjectSymbolIndex = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  sourceIndexRunId: "33333333-3333-4333-8333-333333333333",
  status: "completed",
  parsedFileCount: 1,
  reusedFileCount: 0,
  unsupportedFileCount: 0,
  failedFileCount: 0,
  symbolCount: 1,
  omittedSymbolCount: 0,
  limitReasons: [],
  errorCode: null,
  startedAt: "2026-08-04T00:00:00.000Z",
  completedAt: "2026-08-04T00:00:01.000Z",
};

describe("ProjectSymbolSearchService", () => {
  it("returns bounded catalog matches with one-based source citations", async () => {
    const repository = {
      getCurrentCatalogRun: vi.fn(async () => catalog),
      listCatalogSymbols: vi.fn(async () => ({
        hasMore: false,
        symbols: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            identityKey: "a".repeat(64),
            sourceFileId: "55555555-5555-4555-8555-555555555555",
            relativePath: "src/arc.ts",
            kind: "function" as const,
            name: "buildArc",
            qualifiedName: "buildArc",
            parentIdentityKey: null,
            exported: true,
            range: {
              startByte: 0,
              endByte: 10,
              startLine: 4,
              endLine: 6,
              startColumnByte: 0,
              endColumnByte: 0,
            },
          },
        ],
      })),
    } as unknown as ProjectSymbolIndexRepository;
    const service = new ProjectSymbolSearchService(repository);

    await expect(
      service.search(catalog.projectId, "arc", 5, new AbortController().signal),
    ).resolves.toEqual({
      available: true,
      results: [
        {
          citation: { path: "src/arc.ts", startLine: 5, endLine: 7 },
          kind: "function",
          name: "buildArc",
          exported: true,
        },
      ],
      truncated: false,
    });
  });
});
