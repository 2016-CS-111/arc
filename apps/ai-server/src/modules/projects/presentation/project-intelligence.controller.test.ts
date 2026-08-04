import type { ProjectIntelligenceCatalogResponse } from "@arc/contracts";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ProjectIntelligenceService } from "../application/project-intelligence.service.js";
import { ProjectIntelligenceCatalogRequiredError } from "../domain/project.errors.js";
import { ProjectIntelligenceController } from "./project-intelligence.controller.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";

const response: ProjectIntelligenceCatalogResponse = {
  dependencyIndexRunId: "76e5ee0b-608d-4792-91c5-fd46579e74e4",
  frameworkIndexRunId: null,
  projectId,
  records: [],
  sourceIndexRunId: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
  symbolIndexRunId: "bfcd6c71-f627-45cb-b133-65cf2e129f13",
  truncated: { files: false, records: false, symbols: false },
};

describe("ProjectIntelligenceController", () => {
  it("parses a bounded catalog query and returns the service response", async () => {
    const getCatalog = vi.fn(() => Promise.resolve(response));
    const controller = new ProjectIntelligenceController({ getCatalog } as unknown as ProjectIntelligenceService);

    await expect(controller.getCatalog(projectId, { kinds: "environment,call", maxRecords: "5" })).resolves.toEqual(
      response,
    );
    expect(getCatalog).toHaveBeenCalledWith(projectId, { kinds: ["call", "environment"], maxRecords: 5 });
  });

  it("maps catalog readiness and invalid query errors to HTTP errors", async () => {
    const controller = new ProjectIntelligenceController({
      getCatalog: vi.fn(() => Promise.reject(new ProjectIntelligenceCatalogRequiredError(projectId))),
    } as unknown as ProjectIntelligenceService);

    await expect(controller.getCatalog(projectId, {})).rejects.toBeInstanceOf(ConflictException);
    await expect(controller.getCatalog(projectId, { maxRecords: "999" })).rejects.toBeInstanceOf(BadRequestException);
  });
});
