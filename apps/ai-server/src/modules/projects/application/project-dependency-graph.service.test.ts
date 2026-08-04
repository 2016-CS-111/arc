import type { Project, ProjectDependencyGraphQuery, ProjectDependencyIndex, ProjectSourceIndex } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type {
  FindProjectDependencyGraphEdgesInput,
  ProjectDependencyGraphEdgeRecord,
  ProjectDependencyGraphFileRecord,
} from "../domain/project-dependency-index.types.js";
import {
  InvalidProjectPathError,
  ProjectDependencyCatalogRequiredError,
  ProjectDependencyCatalogStaleError,
  ProjectDependencyGraphFailedError,
  ProjectDependencyPathNotFoundError,
  ProjectNotFoundError,
} from "../domain/project.errors.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectDependencyGraphService } from "./project-dependency-graph.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const sourceIndexRunId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";
const dependencyIndexId = "76e5ee0b-608d-4792-91c5-fd46579e74e4";
const fileAId = "ac871053-d9f1-4f28-b022-1a18079927bb";
const fileBId = "83107b40-6495-455f-a557-b64b29ef6af1";
const fileCId = "9674cdb0-d2ea-43d7-8d52-e48ebfc931cd";

const project: Project = {
  createdAt: "2026-07-28T08:00:00.000Z",
  id: projectId,
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-28T08:00:00.000Z",
};

const sourceRun: ProjectSourceIndex = {
  completedAt: "2026-07-28T10:01:00.000Z",
  errorCode: null,
  id: sourceIndexRunId,
  inspectedBytes: 300,
  inventoryScanId: "72449150-b7e9-4410-8502-10e221dcdf43",
  limitReasons: [],
  projectId,
  readyBytes: 300,
  readyFileCount: 3,
  skippedFileCount: 0,
  startedAt: "2026-07-28T10:00:00.000Z",
  status: "completed",
};

const dependencyRun: ProjectDependencyIndex = {
  bindingCount: 1,
  builtinEdgeCount: 1,
  completedAt: "2026-07-28T11:01:00.000Z",
  edgeCount: 6,
  errorCode: null,
  externalEdgeCount: 1,
  failedFileCount: 0,
  id: dependencyIndexId,
  limitReasons: [],
  localEdgeCount: 3,
  omittedBindingCount: 0,
  omittedEdgeCount: 0,
  parsedFileCount: 3,
  projectId,
  resolutionContextHash: "d".repeat(64),
  resolverWarnings: [],
  reusedFileCount: 0,
  sourceIndexRunId,
  startedAt: "2026-07-28T11:00:00.000Z",
  status: "completed",
  unresolvedEdgeCount: 1,
  unsupportedFileCount: 0,
};

const files: readonly ProjectDependencyGraphFileRecord[] = [
  { relativePath: "src/a.ts", sourceFileId: fileAId },
  { relativePath: "src/b.ts", sourceFileId: fileBId },
  { relativePath: "src/c.ts", sourceFileId: fileCId },
];

const graphEdges: readonly ProjectDependencyGraphEdgeRecord[] = [
  localEdge("0711be25-cae0-44fb-ab57-f427ee5d1701", fileAId, "src/a.ts", fileBId, "src/b.ts", 10),
  externalEdge("185a7a99-a5a4-48d5-8d23-07a0bd03863a", fileAId, "src/a.ts", "react", 20),
  builtinEdge("28d87685-b6dc-4e40-b0d5-e7cdfe86b51e", fileAId, "src/a.ts", "fs", 30),
  unresolvedEdge("39fcbfad-5d7a-4c42-a2ed-fab8301fd56b", fileAId, "src/a.ts", "./missing.js", 40),
  localEdge("4421d127-c1a4-43d8-bda9-598632021cb3", fileBId, "src/b.ts", fileAId, "src/a.ts", 10),
  localEdge("5fe0d6c5-41a6-40d4-85db-59efcc7f9e01", fileBId, "src/b.ts", fileCId, "src/c.ts", 20),
];

describe("ProjectDependencyGraphService", () => {
  it("traverses outgoing edges breadth-first with cycles, terminal nodes, and bindings", async () => {
    const fixture = createFixture();

    const result = await fixture.service.getGraph(projectId, query({ depth: 2, includeBindings: true }));

    expect(result.edges.map((edge) => edge.id)).toEqual(graphEdges.map((edge) => edge.id));
    expect(result.nodes.map((node) => node.id)).toEqual(
      [`builtin:node:fs`, `external:react`, `file:${fileAId}`, `file:${fileBId}`, `file:${fileCId}`].sort(),
    );
    expect(result.edges[0]?.bindings).toHaveLength(1);
    expect(result.edges[2]).toMatchObject({
      resolutionKind: "builtin",
      targetNodeId: "builtin:node:fs",
    });
    expect(result.edges[3]).toMatchObject({
      resolutionKind: "unresolved",
      targetNodeId: null,
    });
    expect(result.truncated).toEqual({ depth: false, edges: false, nodes: false });
    expect(fixture.findGraphEdges).toHaveBeenCalledTimes(3);
  });

  it("supports incoming and both traversal without duplicating cycle edges", async () => {
    const incomingFixture = createFixture();
    const incoming = await incomingFixture.service.getGraph(
      projectId,
      query({ direction: "incoming", path: "src/b.ts" }),
    );
    expect(incoming.edges.map((edge) => edge.id)).toEqual([graphEdges[0]?.id]);
    expect(incoming.nodes.map((node) => node.id)).toContain(`file:${fileAId}`);

    const bothFixture = createFixture();
    const both = await bothFixture.service.getGraph(
      projectId,
      query({ depth: 2, direction: "both", path: "src/b.ts" }),
    );
    expect(new Set(both.edges.map((edge) => edge.id)).size).toBe(both.edges.length);
    expect(both.edges.map((edge) => edge.id)).toEqual(graphEdges.map((edge) => edge.id));
  });

  it("applies filters and reports edge and node truncation independently", async () => {
    const edgeFixture = createFixture();
    const edgeLimited = await edgeFixture.service.getGraph(
      projectId,
      query({ maxEdges: 1, resolutionKind: ["local"] }),
    );
    expect(edgeLimited.edges).toHaveLength(1);
    expect(edgeLimited.truncated.edges).toBe(true);

    const nodeFixture = createFixture();
    const nodeLimited = await nodeFixture.service.getGraph(projectId, query({ maxNodes: 1 }));
    expect(nodeLimited.nodes).toHaveLength(1);
    expect(nodeLimited.edges).toHaveLength(1);
    expect(nodeLimited.edges[0]?.resolutionKind).toBe("unresolved");
    expect(nodeLimited.truncated.nodes).toBe(true);
  });

  it("enforces server depth limits and detects an unexpanded boundary", async () => {
    const fixture = createFixture({
      config: { ARC_PROJECT_DEPENDENCY_GRAPH_MAX_DEPTH: "1" },
    });

    const result = await fixture.service.getGraph(projectId, query({ depth: 3 }));

    expect(result.depth).toBe(1);
    expect(result.truncated.depth).toBe(true);
    expect(result.edges.map((edge) => edge.sourceFileId)).toEqual([fileAId, fileAId, fileAId, fileAId]);
  });

  it("rejects missing, stale, and changing catalogs with stable domain errors", async () => {
    await expect(createFixture({ dependencyRun: null }).service.getGraph(projectId, query())).rejects.toBeInstanceOf(
      ProjectDependencyCatalogRequiredError,
    );
    await expect(createFixture({ sourceRun: null }).service.getGraph(projectId, query())).rejects.toBeInstanceOf(
      ProjectDependencyCatalogStaleError,
    );
    await expect(createFixture({ startFile: null }).service.getGraph(projectId, query())).rejects.toBeInstanceOf(
      ProjectDependencyPathNotFoundError,
    );
    await expect(
      createFixture({ changeCatalogAfterRead: true }).service.getGraph(projectId, query()),
    ).rejects.toBeInstanceOf(ProjectDependencyCatalogStaleError);
  });

  it("preserves public validation errors and hides repository failures", async () => {
    await expect(createFixture({ project: null }).service.getGraph(projectId, query())).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(createFixture().service.getGraph(projectId, query({ path: "../outside.ts" }))).rejects.toBeInstanceOf(
      InvalidProjectPathError,
    );
    await expect(createFixture({ repositoryFailure: true }).service.getGraph(projectId, query())).rejects.toEqual(
      new ProjectDependencyGraphFailedError(),
    );
  });
});

interface FixtureOptions {
  readonly changeCatalogAfterRead?: boolean;
  readonly config?: NodeJS.ProcessEnv;
  readonly dependencyRun?: ProjectDependencyIndex | null;
  readonly project?: Project | null;
  readonly repositoryFailure?: boolean;
  readonly sourceRun?: ProjectSourceIndex | null;
  readonly startFile?: ProjectDependencyGraphFileRecord | null;
}

function createFixture(options: FixtureOptions = {}) {
  const selectedDependencyRun = options.dependencyRun === undefined ? dependencyRun : options.dependencyRun;
  const selectedSourceRun = options.sourceRun === undefined ? sourceRun : options.sourceRun;
  let dependencyCatalogReads = 0;
  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(options.project === undefined ? project : options.project)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const sourceIndexRepository = {
    beginIndex: vi.fn(),
    completeIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(selectedSourceRun)),
    getCurrentReadyCatalog: vi.fn(),
    getLatestRun: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSourceIndexRepository;
  const findGraphEdges = vi.fn((input: FindProjectDependencyGraphEdgesInput) => {
    if (options.repositoryFailure === true) {
      return Promise.reject(new Error("database path leaked"));
    }
    const candidates = graphEdges
      .filter((edge) => !input.excludedEdgeIds.includes(edge.id))
      .filter((edge) => input.dependencyKinds.length === 0 || input.dependencyKinds.includes(edge.kind))
      .filter((edge) => input.resolutionKinds.length === 0 || input.resolutionKinds.includes(edge.resolutionKind))
      .filter((edge) => {
        const outgoing = input.frontierSourceFileIds.includes(edge.sourceFileId);
        const incoming =
          edge.targetSourceFileId !== null && input.frontierSourceFileIds.includes(edge.targetSourceFileId);
        return input.direction === "outgoing"
          ? outgoing
          : input.direction === "incoming"
            ? incoming
            : outgoing || incoming;
      })
      .sort(compareRecords);
    return Promise.resolve({
      edges: candidates.slice(0, input.limit).map((edge) => ({
        ...edge,
        bindings: input.includeBindings ? edge.bindings : [],
      })),
      hasMore: candidates.length > input.limit,
    });
  });
  const dependencyIndexRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    findGraphEdges,
    findGraphFile: vi.fn(({ relativePath }) =>
      Promise.resolve(
        options.startFile === null
          ? null
          : (options.startFile ?? files.find((file) => file.relativePath === relativePath) ?? null),
      ),
    ),
    getCurrentCatalogRun: vi.fn(() => {
      dependencyCatalogReads += 1;
      return Promise.resolve(
        options.changeCatalogAfterRead && dependencyCatalogReads > 1 ? null : selectedDependencyRun,
      );
    }),
    getCurrentFiles: vi.fn(),
    getLatestRun: vi.fn(),
    listCatalogDependencies: vi.fn(),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectDependencyIndexRepository;
  const service = new ProjectDependencyGraphService(
    projectRepository,
    sourceIndexRepository,
    dependencyIndexRepository,
    new ProjectPathNormalizer(),
    loadConfig(options.config ?? {}),
  );
  return { findGraphEdges, service };
}

function query(overrides: Partial<ProjectDependencyGraphQuery> = {}): ProjectDependencyGraphQuery {
  return {
    dependencyKind: [],
    depth: 1,
    direction: "outgoing",
    includeBindings: false,
    maxEdges: 500,
    maxNodes: 100,
    path: "src/a.ts",
    resolutionKind: [],
    ...overrides,
  };
}

function localEdge(
  id: string,
  sourceFileId: string,
  sourceRelativePath: string,
  targetSourceFileId: string,
  targetRelativePath: string,
  startByte: number,
): ProjectDependencyGraphEdgeRecord {
  return edge(id, sourceFileId, sourceRelativePath, startByte, {
    externalPackage: null,
    resolutionKind: "local",
    targetRelativePath,
    targetSourceFileId,
    unresolvedReason: null,
  });
}

function externalEdge(
  id: string,
  sourceFileId: string,
  sourceRelativePath: string,
  packageName: string,
  startByte: number,
): ProjectDependencyGraphEdgeRecord {
  return edge(id, sourceFileId, sourceRelativePath, startByte, {
    externalPackage: packageName,
    resolutionKind: "external",
    targetRelativePath: null,
    targetSourceFileId: null,
    unresolvedReason: null,
  });
}

function builtinEdge(
  id: string,
  sourceFileId: string,
  sourceRelativePath: string,
  specifier: string,
  startByte: number,
): ProjectDependencyGraphEdgeRecord {
  return edge(
    id,
    sourceFileId,
    sourceRelativePath,
    startByte,
    {
      externalPackage: null,
      resolutionKind: "builtin",
      targetRelativePath: null,
      targetSourceFileId: null,
      unresolvedReason: null,
    },
    specifier,
  );
}

function unresolvedEdge(
  id: string,
  sourceFileId: string,
  sourceRelativePath: string,
  specifier: string,
  startByte: number,
): ProjectDependencyGraphEdgeRecord {
  return edge(
    id,
    sourceFileId,
    sourceRelativePath,
    startByte,
    {
      externalPackage: null,
      resolutionKind: "unresolved",
      targetRelativePath: null,
      targetSourceFileId: null,
      unresolvedReason: "not_found",
    },
    specifier,
  );
}

function edge(
  id: string,
  sourceFileId: string,
  sourceRelativePath: string,
  startByte: number,
  resolution: Pick<
    ProjectDependencyGraphEdgeRecord,
    "externalPackage" | "resolutionKind" | "targetRelativePath" | "targetSourceFileId" | "unresolvedReason"
  >,
  specifier = "./target.js",
): ProjectDependencyGraphEdgeRecord {
  return {
    bindings:
      startByte === 10
        ? [
            {
              bindingKey: "b".repeat(64),
              exportedName: null,
              importedName: "target",
              kind: "named",
              localName: "target",
              range: range(startByte),
              typeOnly: false,
            },
          ]
        : [],
    id,
    kind: "static_import",
    range: range(startByte),
    sourceFileId,
    sourceRelativePath,
    specifier,
    specifierRange: range(startByte + 7),
    typeOnly: false,
    ...resolution,
  };
}

function range(startByte: number) {
  return {
    endByte: startByte + 5,
    endColumnByte: startByte + 5,
    endLine: 0,
    startByte,
    startColumnByte: startByte,
    startLine: 0,
  };
}

function compareRecords(left: ProjectDependencyGraphEdgeRecord, right: ProjectDependencyGraphEdgeRecord): number {
  return (
    left.sourceRelativePath.localeCompare(right.sourceRelativePath) ||
    left.range.startByte - right.range.startByte ||
    left.id.localeCompare(right.id)
  );
}
