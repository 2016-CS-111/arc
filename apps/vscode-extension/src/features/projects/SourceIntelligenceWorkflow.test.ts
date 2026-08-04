import type {
  ProjectDependencyIndex,
  ProjectEmbeddingIndex,
  ProjectFrameworkIndex,
  ProjectScan,
  ProjectSourceIndex,
  ProjectSymbolIndex,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  SourceIntelligenceWorkflow,
  type SourceIntelligenceIndexClient,
  type SourceIntelligenceWorkflowError,
} from "./SourceIntelligenceWorkflow.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const timestamp = "2026-07-29T09:00:00.000Z";

describe("SourceIntelligenceWorkflow", () => {
  it("runs every durable stage in dependency order and reports limited stages", async () => {
    const calls: string[] = [];
    const client = createClient(calls, { dependencyStatus: "limited" });
    const progress: string[] = [];

    await expect(
      new SourceIntelligenceWorkflow(client).run(projectId, ({ stage }) => progress.push(stage)),
    ).resolves.toMatchObject({
      limitedStages: ["dependencies"],
      embedding: { status: "completed" },
      framework: { status: "completed" },
    });
    expect(calls).toEqual(["inventory", "source", "symbols", "dependencies", "frameworks", "embeddings"]);
    expect(progress).toEqual(calls);
  });

  it("stops immediately when a stage does not return a terminal published result", async () => {
    const calls: string[] = [];
    const client = createClient(calls, { symbolStatus: "failed" });

    await expect(new SourceIntelligenceWorkflow(client).run(projectId)).rejects.toEqual(
      expect.objectContaining<Partial<SourceIntelligenceWorkflowError>>({
        name: "SourceIntelligenceWorkflowError",
        stage: "symbols",
      }),
    );
    expect(calls).toEqual(["inventory", "source", "symbols"]);
  });
});

function createClient(
  calls: string[],
  options: {
    readonly dependencyStatus?: ProjectDependencyIndex["status"];
    readonly embeddingStatus?: ProjectEmbeddingIndex["status"];
    readonly symbolStatus?: ProjectSymbolIndex["status"];
  } = {},
): SourceIntelligenceIndexClient {
  return {
    indexProjectDependencies: vi.fn(() => {
      calls.push("dependencies");
      return Promise.resolve(dependencyIndex(options.dependencyStatus ?? "completed"));
    }),
    indexProjectEmbeddings: vi.fn(() => {
      calls.push("embeddings");
      return Promise.resolve(embeddingIndex(options.embeddingStatus ?? "completed"));
    }),
    indexProjectFrameworks: vi.fn(() => {
      calls.push("frameworks");
      return Promise.resolve(frameworkIndex());
    }),
    indexProjectSource: vi.fn(() => {
      calls.push("source");
      return Promise.resolve(sourceIndex());
    }),
    indexProjectSymbols: vi.fn(() => {
      calls.push("symbols");
      return Promise.resolve(symbolIndex(options.symbolStatus ?? "completed"));
    }),
    scanProject: vi.fn(() => {
      calls.push("inventory");
      return Promise.resolve(scan());
    }),
  };
}

function scan(): ProjectScan {
  return {
    completedAt: timestamp,
    errorCode: null,
    fileCount: 4,
    id: "72449150-b7e9-4410-8502-10e221dcdf43",
    ignoredPathCount: 1,
    limitReasons: [],
    projectId,
    skippedSymlinkCount: 0,
    startedAt: timestamp,
    status: "completed",
    totalBytes: 512,
  };
}

function sourceIndex(): ProjectSourceIndex {
  return {
    completedAt: timestamp,
    errorCode: null,
    id: "d87960c1-aa09-4201-bf2f-4249cf2c5bd3",
    inspectedBytes: 512,
    inventoryScanId: scan().id,
    limitReasons: [],
    projectId,
    readyBytes: 512,
    readyFileCount: 4,
    skippedFileCount: 0,
    startedAt: timestamp,
    status: "completed",
  };
}

function symbolIndex(status: ProjectSymbolIndex["status"]): ProjectSymbolIndex {
  return {
    completedAt: timestamp,
    errorCode: status === "failed" ? "unknown_error" : null,
    failedFileCount: status === "failed" ? 1 : 0,
    id: "be1a41fc-efbf-43b8-90aa-420a6679f7af",
    limitReasons: [],
    omittedSymbolCount: 0,
    parsedFileCount: status === "failed" ? 0 : 4,
    projectId,
    reusedFileCount: 0,
    sourceIndexRunId: sourceIndex().id,
    startedAt: timestamp,
    status,
    symbolCount: status === "failed" ? 0 : 12,
    unsupportedFileCount: 0,
  };
}

function dependencyIndex(status: ProjectDependencyIndex["status"]): ProjectDependencyIndex {
  return {
    bindingCount: 3,
    builtinEdgeCount: 0,
    completedAt: timestamp,
    edgeCount: 3,
    errorCode: null,
    externalEdgeCount: 1,
    failedFileCount: 0,
    id: "e376bc64-df40-4bb1-9ca6-9007da173ae9",
    limitReasons: status === "limited" ? ["total_edges"] : [],
    localEdgeCount: 2,
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    parsedFileCount: 4,
    projectId,
    resolutionContextHash: "a".repeat(64),
    resolverWarnings: [],
    reusedFileCount: 0,
    sourceIndexRunId: sourceIndex().id,
    startedAt: timestamp,
    status,
    unresolvedEdgeCount: 0,
    unsupportedFileCount: 0,
  };
}

function frameworkIndex(): ProjectFrameworkIndex {
  return {
    analyzedFileCount: 4,
    analyzerSetIdentity: "b".repeat(64),
    completedAt: timestamp,
    dependencyIndexRunId: dependencyIndex("completed").id,
    entityCount: 8,
    errorCode: null,
    failedFileCount: 0,
    id: "b2f4388a-fe91-4327-813a-489365c3ed4e",
    limitReasons: [],
    omissionCount: 0,
    projectId,
    relationshipCount: 5,
    reusedFileCount: 0,
    scopeCount: 2,
    sourceIndexRunId: sourceIndex().id,
    startedAt: timestamp,
    status: "completed",
    symbolIndexRunId: symbolIndex("completed").id,
    unresolvedRelationshipCount: 0,
    unsupportedFileCount: 0,
    warnings: [],
  };
}

function embeddingIndex(status: ProjectEmbeddingIndex["status"]): ProjectEmbeddingIndex {
  return {
    id: "c04b1a41-fba2-4327-813a-489365c3ed4e",
    projectId,
    sourceIndexRunId: sourceIndex().id,
    symbolIndexRunId: symbolIndex("completed").id,
    dependencyIndexRunId: dependencyIndex("completed").id,
    frameworkIndexRunId: frameworkIndex().id,
    status,
    provider: "ollama",
    model: "bge-m3",
    dimensions: 1_024,
    inputFormat: "arc-source-v1+plain-v1",
    chunkerIdentity: "arc-source-chunker-v1",
    fileCount: 4,
    chunkCount: 18,
    embeddedChunkCount: 18,
    reusedChunkCount: 0,
    limitReasons: [],
    errorCode: status === "failed" ? "embedding_failed" : null,
    startedAt: timestamp,
    completedAt: status === "running" ? null : timestamp,
  };
}
