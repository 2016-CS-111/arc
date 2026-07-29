import { describe, expect, it, vi } from "vitest";

import { ProjectClient } from "./ProjectClient.js";

const timestamp = "2026-07-27T08:00:00.000Z";
const project = {
  createdAt: timestamp,
  id: "03f4c07e-e890-454d-b557-17b780906ceb",
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: timestamp,
};
const scan = {
  completedAt: timestamp,
  errorCode: null,
  fileCount: 203,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 17,
  limitReasons: [],
  projectId: project.id,
  skippedSymlinkCount: 0,
  startedAt: timestamp,
  status: "completed",
  totalBytes: 673_770,
};
const sourceIndex = {
  completedAt: timestamp,
  errorCode: null,
  id: "d87960c1-aa09-4201-bf2f-4249cf2c5bd3",
  inspectedBytes: scan.totalBytes,
  inventoryScanId: scan.id,
  limitReasons: [],
  projectId: project.id,
  readyBytes: scan.totalBytes,
  readyFileCount: scan.fileCount,
  skippedFileCount: 0,
  startedAt: timestamp,
  status: "completed",
};
const symbolIndex = {
  completedAt: timestamp,
  errorCode: null,
  failedFileCount: 0,
  id: "be1a41fc-efbf-43b8-90aa-420a6679f7af",
  limitReasons: [],
  omittedSymbolCount: 0,
  parsedFileCount: scan.fileCount,
  projectId: project.id,
  reusedFileCount: 0,
  sourceIndexRunId: sourceIndex.id,
  startedAt: timestamp,
  status: "completed",
  symbolCount: 500,
  unsupportedFileCount: 0,
};
const dependencyIndex = {
  bindingCount: 30,
  builtinEdgeCount: 5,
  completedAt: timestamp,
  edgeCount: 40,
  errorCode: null,
  externalEdgeCount: 10,
  failedFileCount: 0,
  id: "e376bc64-df40-4bb1-9ca6-9007da173ae9",
  limitReasons: [],
  localEdgeCount: 20,
  omittedBindingCount: 0,
  omittedEdgeCount: 0,
  parsedFileCount: scan.fileCount,
  projectId: project.id,
  resolutionContextHash: "a".repeat(64),
  resolverWarnings: [],
  reusedFileCount: 0,
  sourceIndexRunId: sourceIndex.id,
  startedAt: timestamp,
  status: "completed",
  unresolvedEdgeCount: 5,
  unsupportedFileCount: 0,
};
const frameworkIndex = {
  analyzedFileCount: 20,
  analyzerSetIdentity: "b".repeat(64),
  completedAt: timestamp,
  dependencyIndexRunId: dependencyIndex.id,
  entityCount: 100,
  errorCode: null,
  failedFileCount: 0,
  id: "b2f4388a-fe91-4327-813a-489365c3ed4e",
  limitReasons: [],
  omissionCount: 0,
  projectId: project.id,
  relationshipCount: 50,
  reusedFileCount: 0,
  scopeCount: 4,
  sourceIndexRunId: sourceIndex.id,
  startedAt: timestamp,
  status: "completed",
  symbolIndexRunId: symbolIndex.id,
  unresolvedRelationshipCount: 0,
  unsupportedFileCount: 0,
  warnings: [],
};
const embeddingIndex = {
  id: "c04b1a41-fba2-4327-813a-489365c3ed4e",
  projectId: project.id,
  sourceIndexRunId: sourceIndex.id,
  symbolIndexRunId: symbolIndex.id,
  dependencyIndexRunId: dependencyIndex.id,
  frameworkIndexRunId: frameworkIndex.id,
  status: "completed",
  provider: "ollama",
  model: "bge-m3",
  dimensions: 1_024,
  inputFormat: "arc-source-v1+plain-v1",
  chunkerIdentity: "arc-source-chunker-v1",
  fileCount: 20,
  chunkCount: 120,
  embeddedChunkCount: 120,
  reusedChunkCount: 0,
  limitReasons: [],
  errorCode: null,
  startedAt: timestamp,
  completedAt: timestamp,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("ProjectClient", () => {
  it("registers a workspace through the validated project endpoint", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response({ created: true, project }));
    const client = new ProjectClient("http://127.0.0.1:7331/", fetchImplementation);

    await expect(client.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).resolves.toEqual({
      created: true,
      project,
    });
    expect(fetchImplementation).toHaveBeenCalledWith("http://127.0.0.1:7331/projects/register", {
      body: JSON.stringify({ name: "Arc", rootPath: "/workspace/arc" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("starts scans and restores their latest durable status", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(scan))
      .mockResolvedValueOnce(response({ scan }));
    const client = new ProjectClient("http://127.0.0.1:7331", fetchImplementation);

    await expect(client.scanProject(project.id)).resolves.toEqual(scan);
    await expect(client.getLatestScan(project.id)).resolves.toEqual({ scan });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      `http://127.0.0.1:7331/projects/${project.id}/inventory/scan`,
      { method: "POST" },
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:7331/projects/${project.id}/inventory/scan`,
      {},
    );
  });

  it("indexes every source-intelligence layer and restores their durable status", async () => {
    const sourceStatus = {
      currentCatalog: {
        completedAt: timestamp,
        inspectedBytes: sourceIndex.inspectedBytes,
        inventoryScanId: scan.id,
        readyBytes: sourceIndex.readyBytes,
        readyFileCount: sourceIndex.readyFileCount,
        skippedFileCount: 0,
        sourceIndexId: sourceIndex.id,
        stale: false,
      },
      latestRun: sourceIndex,
    };
    const symbolStatus = {
      currentCatalog: {
        completedAt: timestamp,
        failedFileCount: 0,
        omittedSymbolCount: 0,
        parsedFileCount: symbolIndex.parsedFileCount,
        reusedFileCount: 0,
        sourceIndexRunId: sourceIndex.id,
        stale: false,
        symbolCount: symbolIndex.symbolCount,
        symbolIndexId: symbolIndex.id,
        unsupportedFileCount: 0,
      },
      latestRun: symbolIndex,
    };
    const dependencyStatus = {
      currentCatalog: {
        bindingCount: dependencyIndex.bindingCount,
        builtinEdgeCount: dependencyIndex.builtinEdgeCount,
        completedAt: timestamp,
        dependencyIndexId: dependencyIndex.id,
        edgeCount: dependencyIndex.edgeCount,
        externalEdgeCount: dependencyIndex.externalEdgeCount,
        failedFileCount: dependencyIndex.failedFileCount,
        limitReasons: dependencyIndex.limitReasons,
        localEdgeCount: dependencyIndex.localEdgeCount,
        omittedBindingCount: dependencyIndex.omittedBindingCount,
        omittedEdgeCount: dependencyIndex.omittedEdgeCount,
        parsedFileCount: dependencyIndex.parsedFileCount,
        resolutionContextHash: dependencyIndex.resolutionContextHash,
        resolverWarnings: dependencyIndex.resolverWarnings,
        reusedFileCount: dependencyIndex.reusedFileCount,
        sourceIndexRunId: sourceIndex.id,
        stale: false,
        unresolvedEdgeCount: dependencyIndex.unresolvedEdgeCount,
        unsupportedFileCount: dependencyIndex.unsupportedFileCount,
      },
      latestRun: dependencyIndex,
    };
    const frameworkStatus = {
      currentCatalog: { ...frameworkIndex, stale: false },
      latestRun: frameworkIndex,
    };
    const embeddingStatus = {
      currentCatalog: { ...embeddingIndex, stale: false },
      latestRun: embeddingIndex,
    };
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(sourceIndex))
      .mockResolvedValueOnce(response(symbolIndex))
      .mockResolvedValueOnce(response(dependencyIndex))
      .mockResolvedValueOnce(response(frameworkIndex))
      .mockResolvedValueOnce(response(embeddingIndex))
      .mockResolvedValueOnce(response({ scan }))
      .mockResolvedValueOnce(response(sourceStatus))
      .mockResolvedValueOnce(response(symbolStatus))
      .mockResolvedValueOnce(response(dependencyStatus))
      .mockResolvedValueOnce(response(frameworkStatus))
      .mockResolvedValueOnce(response(embeddingStatus));
    const client = new ProjectClient("http://127.0.0.1:7331", fetchImplementation);

    await expect(client.indexProjectSource(project.id)).resolves.toEqual(sourceIndex);
    await expect(client.indexProjectSymbols(project.id)).resolves.toEqual(symbolIndex);
    await expect(client.indexProjectDependencies(project.id)).resolves.toEqual(dependencyIndex);
    await expect(client.indexProjectFrameworks(project.id)).resolves.toEqual(frameworkIndex);
    await expect(client.indexProjectEmbeddings(project.id)).resolves.toEqual(embeddingIndex);
    await expect(client.getSourceIntelligenceStatus(project.id)).resolves.toMatchObject({
      dependency: dependencyStatus,
      embedding: embeddingStatus,
      framework: frameworkStatus,
      inventory: { scan },
      source: sourceStatus,
      symbol: symbolStatus,
    });
    expect(fetchImplementation.mock.calls.map(([url, options]) => [url, options?.method ?? "GET"])).toEqual([
      [`http://127.0.0.1:7331/projects/${project.id}/sources/index`, "POST"],
      [`http://127.0.0.1:7331/projects/${project.id}/symbols/index`, "POST"],
      [`http://127.0.0.1:7331/projects/${project.id}/dependencies/index`, "POST"],
      [`http://127.0.0.1:7331/projects/${project.id}/frameworks/index`, "POST"],
      [`http://127.0.0.1:7331/projects/${project.id}/embeddings/index`, "POST"],
      [`http://127.0.0.1:7331/projects/${project.id}/inventory/scan`, "GET"],
      [`http://127.0.0.1:7331/projects/${project.id}/sources/index`, "GET"],
      [`http://127.0.0.1:7331/projects/${project.id}/symbols/index`, "GET"],
      [`http://127.0.0.1:7331/projects/${project.id}/dependencies/index`, "GET"],
      [`http://127.0.0.1:7331/projects/${project.id}/frameworks/index`, "GET"],
      [`http://127.0.0.1:7331/projects/${project.id}/embeddings/index`, "GET"],
    ]);
  });

  it("reports transport, HTTP, and contract failures clearly", async () => {
    const unavailable = new ProjectClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockRejectedValue(new Error()),
    );
    const rejected = new ProjectClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockResolvedValue(response({ message: "invalid root" }, 400)),
    );
    const invalidRegistration = new ProjectClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockResolvedValue(response({ unexpected: true })),
    );
    const invalidScan = new ProjectClient(
      "http://127.0.0.1:7331",
      vi.fn<typeof fetch>().mockResolvedValue(response({ unexpected: true })),
    );

    await expect(unavailable.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).rejects.toThrow(
      "Arc backend is unavailable.",
    );
    await expect(rejected.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).rejects.toThrow(
      "Arc backend returned HTTP 400.",
    );
    await expect(invalidRegistration.registerProject({ name: "Arc", rootPath: "/workspace/arc" })).rejects.toThrow(
      "Arc backend returned an invalid project registration response.",
    );
    await expect(invalidScan.scanProject(project.id)).rejects.toThrow(
      "Arc backend returned an invalid project scan response.",
    );
  });
});
