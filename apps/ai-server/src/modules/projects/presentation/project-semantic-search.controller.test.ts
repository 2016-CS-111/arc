import type { ProjectSemanticSearchResponse } from "@arc/contracts";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ProjectSemanticSearchService } from "../application/project-semantic-search.service.js";
import { ProjectSemanticSearchController } from "./project-semantic-search.controller.js";

const response: ProjectSemanticSearchResponse = {
  projectId: "00000000-0000-4000-8000-000000000001",
  embeddingIndexId: "00000000-0000-4000-8000-000000000010",
  sourceIndexRunId: "00000000-0000-4000-8000-000000000003",
  symbolIndexRunId: "00000000-0000-4000-8000-000000000004",
  dependencyIndexRunId: "00000000-0000-4000-8000-000000000005",
  frameworkIndexRunId: "00000000-0000-4000-8000-000000000006",
  model: "bge-m3",
  dimensions: 1_024,
  catalogLimited: false,
  limit: 10,
  truncated: false,
  results: [],
};

describe("ProjectSemanticSearchController", () => {
  it("parses defaults before calling the search service", async () => {
    const search = vi.fn(() => Promise.resolve(response));
    const controller = new ProjectSemanticSearchController({
      search,
    } as unknown as ProjectSemanticSearchService);

    await expect(controller.search(response.projectId, { query: "  find registration  " })).resolves.toEqual(response);
    expect(search).toHaveBeenCalledWith(response.projectId, {
      query: "find registration",
      languages: [],
      limit: 10,
    });
  });

  it("rejects an out-of-bounds result limit", async () => {
    const controller = new ProjectSemanticSearchController({
      search: vi.fn(),
    } as unknown as ProjectSemanticSearchService);

    await expect(controller.search(response.projectId, { query: "find code", limit: 51 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
