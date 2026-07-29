import type {
  LatestProjectDependencyIndexResponse,
  LatestProjectFrameworkIndexResponse,
  LatestProjectSourceIndexResponse,
  LatestProjectSymbolIndexResponse,
} from "@arc/contracts";
import { describe, expect, it } from "vitest";

import type { ProjectSourceIntelligenceStatus } from "../../infrastructure/backend/ProjectClient.js";
import { createSourceIntelligencePresentation } from "./sourceIntelligencePresentation.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const scanId = "72449150-b7e9-4410-8502-10e221dcdf43";
const sourceId = "d87960c1-aa09-4201-bf2f-4249cf2c5bd3";
const symbolId = "be1a41fc-efbf-43b8-90aa-420a6679f7af";
const dependencyId = "e376bc64-df40-4bb1-9ca6-9007da173ae9";
const frameworkId = "b2f4388a-fe91-4327-813a-489365c3ed4e";
const timestamp = "2026-07-29T09:00:00.000Z";

describe("createSourceIntelligencePresentation", () => {
  it("requires indexing when durable catalogs are absent or stale", () => {
    const absent = readyStatus();
    absent.inventory.scan = null;
    expect(createSourceIntelligencePresentation(absent)).toMatchObject({
      background: "warning",
      text: "$(warning) Arc: Index required",
    });

    const stale = readyStatus();
    if (stale.source.currentCatalog !== null) stale.source.currentCatalog.stale = true;
    expect(createSourceIntelligencePresentation(stale).tooltip).toContain("fingerprints");
  });

  it("restores running and failed durable states", () => {
    const running = readyStatus();
    if (running.symbol.latestRun !== null) {
      running.symbol.latestRun.status = "running";
      running.symbol.latestRun.completedAt = null;
    }
    expect(createSourceIntelligencePresentation(running)).toMatchObject({
      background: null,
      text: "$(sync~spin) Arc: Indexing",
    });

    const failed = readyStatus();
    if (failed.dependency.latestRun !== null) {
      failed.dependency.latestRun.status = "failed";
      failed.dependency.latestRun.errorCode = "index_interrupted";
    }
    expect(createSourceIntelligencePresentation(failed)).toMatchObject({
      background: "error",
      text: "$(error) Arc: Index failed",
    });
  });

  it("requires exact framework provenance and presents a fresh complete catalog", () => {
    const mismatched = readyStatus();
    if (mismatched.framework.currentCatalog !== null) {
      mismatched.framework.currentCatalog.symbolIndexRunId = "475a3c84-832a-4182-9276-654d9c237d68";
    }
    expect(createSourceIntelligencePresentation(mismatched).text).toBe("$(warning) Arc: Index required");

    const ready = createSourceIntelligencePresentation(readyStatus());
    expect(ready).toMatchObject({
      background: null,
      text: "$(symbol-structure) Arc: Intelligence ready",
    });
    expect(ready.tooltip).toContain("12 symbols, 3 dependency edges, 8 framework entities");
  });

  it("surfaces configured limits from an otherwise fresh catalog", () => {
    const limited = readyStatus();
    if (limited.dependency.latestRun !== null) {
      limited.dependency.latestRun.status = "limited";
      limited.dependency.latestRun.limitReasons = ["total_edges"];
    }
    const presentation = createSourceIntelligencePresentation(limited);
    expect(presentation).toMatchObject({
      background: "warning",
      text: "$(warning) Arc: Index limited",
    });
    expect(presentation.tooltip).toContain("dependency");
  });
});

function readyStatus(): ProjectSourceIntelligenceStatus {
  return {
    dependency: dependencyStatus(),
    framework: frameworkStatus(),
    inventory: {
      scan: {
        completedAt: timestamp,
        errorCode: null,
        fileCount: 4,
        id: scanId,
        ignoredPathCount: 1,
        limitReasons: [],
        projectId,
        skippedSymlinkCount: 0,
        startedAt: timestamp,
        status: "completed",
        totalBytes: 512,
      },
    },
    source: sourceStatus(),
    symbol: symbolStatus(),
  };
}

function sourceStatus(): LatestProjectSourceIndexResponse {
  return {
    currentCatalog: {
      completedAt: timestamp,
      inspectedBytes: 512,
      inventoryScanId: scanId,
      readyBytes: 512,
      readyFileCount: 4,
      skippedFileCount: 0,
      sourceIndexId: sourceId,
      stale: false,
    },
    latestRun: {
      completedAt: timestamp,
      errorCode: null,
      id: sourceId,
      inspectedBytes: 512,
      inventoryScanId: scanId,
      limitReasons: [],
      projectId,
      readyBytes: 512,
      readyFileCount: 4,
      skippedFileCount: 0,
      startedAt: timestamp,
      status: "completed",
    },
  };
}

function symbolStatus(): LatestProjectSymbolIndexResponse {
  return {
    currentCatalog: {
      completedAt: timestamp,
      failedFileCount: 0,
      omittedSymbolCount: 0,
      parsedFileCount: 4,
      reusedFileCount: 0,
      sourceIndexRunId: sourceId,
      stale: false,
      symbolCount: 12,
      symbolIndexId: symbolId,
      unsupportedFileCount: 0,
    },
    latestRun: {
      completedAt: timestamp,
      errorCode: null,
      failedFileCount: 0,
      id: symbolId,
      limitReasons: [],
      omittedSymbolCount: 0,
      parsedFileCount: 4,
      projectId,
      reusedFileCount: 0,
      sourceIndexRunId: sourceId,
      startedAt: timestamp,
      status: "completed",
      symbolCount: 12,
      unsupportedFileCount: 0,
    },
  };
}

function dependencyStatus(): LatestProjectDependencyIndexResponse {
  const counts = {
    bindingCount: 3,
    builtinEdgeCount: 0,
    edgeCount: 3,
    externalEdgeCount: 1,
    failedFileCount: 0,
    limitReasons: [] as [],
    localEdgeCount: 2,
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    parsedFileCount: 4,
    resolutionContextHash: "a".repeat(64),
    resolverWarnings: [] as [],
    reusedFileCount: 0,
    sourceIndexRunId: sourceId,
    unresolvedEdgeCount: 0,
    unsupportedFileCount: 0,
  };
  return {
    currentCatalog: {
      ...counts,
      completedAt: timestamp,
      dependencyIndexId: dependencyId,
      stale: false,
    },
    latestRun: {
      ...counts,
      completedAt: timestamp,
      errorCode: null,
      id: dependencyId,
      projectId,
      startedAt: timestamp,
      status: "completed",
    },
  };
}

function frameworkStatus(): LatestProjectFrameworkIndexResponse {
  const catalog = {
    analyzedFileCount: 4,
    analyzerSetIdentity: "b".repeat(64),
    completedAt: timestamp,
    dependencyIndexRunId: dependencyId,
    entityCount: 8,
    errorCode: null,
    failedFileCount: 0,
    id: frameworkId,
    limitReasons: [] as [],
    omissionCount: 0,
    projectId,
    relationshipCount: 5,
    reusedFileCount: 0,
    scopeCount: 2,
    sourceIndexRunId: sourceId,
    startedAt: timestamp,
    status: "completed" as const,
    symbolIndexRunId: symbolId,
    unresolvedRelationshipCount: 0,
    unsupportedFileCount: 0,
    warnings: [] as [],
  };
  return {
    currentCatalog: { ...catalog, stale: false },
    latestRun: { ...catalog },
  };
}
