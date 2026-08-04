import type { ProjectSourceIntelligenceStatus } from "../../infrastructure/backend/ProjectClient.js";
import type { SourceIntelligenceStage } from "./SourceIntelligenceWorkflow.js";

export interface SourceIntelligencePresentation {
  readonly background: "warning" | "error" | null;
  readonly text: string;
  readonly tooltip: string;
}

interface StageRun {
  readonly stage: SourceIntelligenceStage;
  readonly status: "running" | "completed" | "limited" | "failed";
}

export function createSourceIntelligencePresentation(
  intelligence: ProjectSourceIntelligenceStatus,
): SourceIntelligencePresentation {
  const runs = stageRuns(intelligence);
  const running = runs.find((run) => run.status === "running");
  if (running !== undefined) {
    return {
      background: null,
      text: "$(sync~spin) Arc: Indexing",
      tooltip: `Arc is ${stageActivity(running.stage)}.`,
    };
  }

  const failed = runs.find((run) => run.status === "failed");
  if (failed !== undefined) {
    return {
      background: "error",
      text: "$(error) Arc: Index failed",
      tooltip: `The latest Arc ${stageLabel(failed.stage)} stage failed. The previous complete catalogs were preserved.`,
    };
  }

  const scan = intelligence.inventory.scan;
  if (scan === null) {
    return indexRequired("Arc has no repository inventory for this workspace.");
  }
  const source = intelligence.source.currentCatalog;
  if (source === null || source.stale || source.inventoryScanId !== scan.id) {
    return indexRequired("Source fingerprints are missing or stale.");
  }
  const symbol = intelligence.symbol.currentCatalog;
  if (symbol === null || symbol.stale || symbol.sourceIndexRunId !== source.sourceIndexId) {
    return indexRequired("The symbol catalog is missing or stale.");
  }
  const dependency = intelligence.dependency.currentCatalog;
  if (dependency === null || dependency.stale || dependency.sourceIndexRunId !== source.sourceIndexId) {
    return indexRequired("The dependency catalog is missing or stale.");
  }
  const framework = intelligence.framework.currentCatalog;
  if (
    framework === null ||
    framework.stale ||
    framework.sourceIndexRunId !== source.sourceIndexId ||
    framework.symbolIndexRunId !== symbol.symbolIndexId ||
    framework.dependencyIndexRunId !== dependency.dependencyIndexId
  ) {
    return indexRequired("The framework catalog is missing or stale.");
  }
  const embedding = intelligence.embedding.currentCatalog;
  if (
    embedding === null ||
    embedding.stale ||
    embedding.sourceIndexRunId !== source.sourceIndexId ||
    embedding.symbolIndexRunId !== symbol.symbolIndexId ||
    embedding.dependencyIndexRunId !== dependency.dependencyIndexId ||
    embedding.frameworkIndexRunId !== framework.id
  ) {
    return indexRequired("The embedding catalog is missing or stale.");
  }

  const limitedStages = runs.filter((run) => run.status === "limited").map((run) => stageLabel(run.stage));
  const counts = `${String(symbol.symbolCount)} symbols, ${String(dependency.edgeCount)} dependency edges, ${String(
    framework.entityCount,
  )} framework entities, ${String(embedding.chunkCount)} semantic chunks`;
  if (limitedStages.length > 0) {
    return {
      background: "warning",
      text: "$(warning) Arc: Index limited",
      tooltip: `${counts}. Configured limits were reached in ${limitedStages.join(", ")}.`,
    };
  }
  return {
    background: null,
    text: "$(symbol-structure) Arc: Intelligence ready",
    tooltip: `${counts}. Updated ${formatTimestamp(embedding.completedAt)}.`,
  };
}

function stageRuns(intelligence: ProjectSourceIntelligenceStatus): readonly StageRun[] {
  return [
    ...(intelligence.inventory.scan === null
      ? []
      : [{ stage: "inventory" as const, status: intelligence.inventory.scan.status }]),
    ...(intelligence.source.latestRun === null
      ? []
      : [{ stage: "source" as const, status: intelligence.source.latestRun.status }]),
    ...(intelligence.symbol.latestRun === null
      ? []
      : [{ stage: "symbols" as const, status: intelligence.symbol.latestRun.status }]),
    ...(intelligence.dependency.latestRun === null
      ? []
      : [{ stage: "dependencies" as const, status: intelligence.dependency.latestRun.status }]),
    ...(intelligence.framework.latestRun === null
      ? []
      : [{ stage: "frameworks" as const, status: intelligence.framework.latestRun.status }]),
    ...(intelligence.embedding.latestRun === null
      ? []
      : [{ stage: "embeddings" as const, status: intelligence.embedding.latestRun.status }]),
  ];
}

function indexRequired(reason: string): SourceIntelligencePresentation {
  return {
    background: "warning",
    text: "$(warning) Arc: Index required",
    tooltip: `${reason} Run Arc: Index Workspace Intelligence.`,
  };
}

function stageActivity(stage: SourceIntelligenceStage): string {
  switch (stage) {
    case "inventory":
      return "scanning repository metadata";
    case "source":
      return "fingerprinting safe source files";
    case "symbols":
      return "extracting symbols";
    case "dependencies":
      return "resolving dependencies";
    case "frameworks":
      return "analyzing framework structure";
    case "embeddings":
      return "embedding semantic chunks";
  }
}

function stageLabel(stage: SourceIntelligenceStage): string {
  switch (stage) {
    case "inventory":
      return "inventory";
    case "source":
      return "source";
    case "symbols":
      return "symbol";
    case "dependencies":
      return "dependency";
    case "frameworks":
      return "framework";
    case "embeddings":
      return "embedding";
  }
}

function formatTimestamp(timestamp: string | null): string {
  return timestamp === null ? "now" : new Date(timestamp).toLocaleString();
}
