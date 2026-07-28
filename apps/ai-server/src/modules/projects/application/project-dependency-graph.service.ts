import {
  ProjectDependencyGraphResponseSchema,
  type ProjectDependencyGraphEdge,
  type ProjectDependencyGraphNode,
  type ProjectDependencyGraphQuery,
  type ProjectDependencyGraphResponse,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import type {
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
import {
  PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
} from "../projects.constants.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";

@Injectable()
export class ProjectDependencyGraphService {
  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY)
    private readonly sourceIndexRepository: ProjectSourceIndexRepository,
    @Inject(PROJECT_DEPENDENCY_INDEX_REPOSITORY)
    private readonly dependencyIndexRepository: ProjectDependencyIndexRepository,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async getGraph(
    projectId: string,
    query: ProjectDependencyGraphQuery,
  ): Promise<ProjectDependencyGraphResponse> {
    try {
      const project = await this.projectRepository.findById(projectId);
      if (project === null) {
        throw new ProjectNotFoundError(projectId);
      }

      const startPath = this.pathNormalizer.normalize(query.path);
      const [dependencyRun, sourceRun] = await Promise.all([
        this.dependencyIndexRepository.getCurrentCatalogRun(projectId),
        this.sourceIndexRepository.getCurrentCatalogRun(projectId),
      ]);
      if (dependencyRun === null) {
        throw new ProjectDependencyCatalogRequiredError(projectId);
      }
      if (sourceRun?.id !== dependencyRun.sourceIndexRunId) {
        throw new ProjectDependencyCatalogStaleError(projectId);
      }

      const startFile = await this.dependencyIndexRepository.findGraphFile({
        dependencyIndexId: dependencyRun.id,
        projectId,
        relativePath: startPath,
      });
      if (startFile === null) {
        await this.assertCatalogUnchanged(projectId, dependencyRun.id, sourceRun.id);
        throw new ProjectDependencyPathNotFoundError(startPath);
      }

      const response = await this.traverse(projectId, dependencyRun.id, sourceRun.id, startFile, startPath, query);
      await this.assertCatalogUnchanged(projectId, dependencyRun.id, sourceRun.id);
      return ProjectDependencyGraphResponseSchema.parse(response);
    } catch (error) {
      if (isPublicGraphError(error)) {
        throw error;
      }
      throw new ProjectDependencyGraphFailedError();
    }
  }

  private async traverse(
    projectId: string,
    dependencyIndexId: string,
    sourceIndexRunId: string,
    startFile: ProjectDependencyGraphFileRecord,
    startPath: string,
    query: ProjectDependencyGraphQuery,
  ): Promise<ProjectDependencyGraphResponse> {
    const maxDepth = Math.min(query.depth, this.config.projectDependency.graphMaxDepth);
    const maxNodes = Math.min(query.maxNodes, this.config.projectDependency.graphMaxNodes);
    const maxEdges = Math.min(query.maxEdges, this.config.projectDependency.graphMaxEdges);
    const nodes = new Map<string, ProjectDependencyGraphNode>();
    const edges: ProjectDependencyGraphEdge[] = [];
    const seenEdgeIds = new Set<string>();
    const discoveredFileIds = new Set<string>([startFile.sourceFileId]);
    let frontier = [startFile.sourceFileId];
    let depthReached = 0;
    let nodeLimitReached = false;
    let edgeLimitReached = false;

    nodes.set(fileNodeId(startFile.sourceFileId), toFileNode(startFile));

    while (frontier.length > 0 && depthReached < maxDepth && edges.length < maxEdges) {
      const page = await this.dependencyIndexRepository.findGraphEdges({
        dependencyIndexId,
        dependencyKinds: query.dependencyKind,
        direction: query.direction,
        excludedEdgeIds: [...seenEdgeIds],
        frontierSourceFileIds: [...frontier].sort(compareText),
        includeBindings: query.includeBindings,
        limit: maxEdges - edges.length,
        projectId,
        resolutionKinds: query.resolutionKind,
      });
      edgeLimitReached ||= page.hasMore;

      const nextFrontier = new Set<string>();
      for (const record of page.edges) {
        seenEdgeIds.add(record.id);
        const candidate = toGraphCandidate(record, query.includeBindings);
        const newNodes = candidate.nodes.filter((node) => !nodes.has(node.id));
        if (nodes.size + newNodes.length > maxNodes) {
          nodeLimitReached = true;
          continue;
        }

        for (const node of newNodes) {
          nodes.set(node.id, node);
        }
        edges.push(candidate.edge);
        this.collectNextFiles(record, query.direction, discoveredFileIds, nextFrontier);
      }

      depthReached += 1;
      frontier = [...nextFrontier].sort(compareText);
      if (edges.length === maxEdges && frontier.length > 0) {
        edgeLimitReached = true;
      }
      await yieldToEventLoop();
    }

    let depthLimitReached = query.depth > maxDepth;
    if (!depthLimitReached && frontier.length > 0 && edges.length < maxEdges) {
      const boundary = await this.dependencyIndexRepository.findGraphEdges({
        dependencyIndexId,
        dependencyKinds: query.dependencyKind,
        direction: query.direction,
        excludedEdgeIds: [...seenEdgeIds],
        frontierSourceFileIds: frontier,
        includeBindings: false,
        limit: 1,
        projectId,
        resolutionKinds: query.resolutionKind,
      });
      depthLimitReached = boundary.edges.length > 0 || boundary.hasMore;
    }

    return {
      dependencyIndexId,
      depth: maxDepth,
      direction: query.direction,
      edges: edges.sort(compareEdges),
      nodes: [...nodes.values()].sort((left, right) => compareText(left.id, right.id)),
      projectId,
      sourceIndexRunId,
      startPath,
      truncated: {
        depth: depthLimitReached,
        edges: edgeLimitReached,
        nodes: nodeLimitReached,
      },
    };
  }

  private collectNextFiles(
    edge: ProjectDependencyGraphEdgeRecord,
    direction: ProjectDependencyGraphQuery["direction"],
    discoveredFileIds: Set<string>,
    nextFrontier: Set<string>,
  ): void {
    if (direction !== "outgoing") {
      discoverFile(edge.sourceFileId, discoveredFileIds, nextFrontier);
    }
    if (direction !== "incoming" && edge.targetSourceFileId !== null) {
      discoverFile(edge.targetSourceFileId, discoveredFileIds, nextFrontier);
    }
  }

  private async assertCatalogUnchanged(
    projectId: string,
    dependencyIndexId: string,
    sourceIndexRunId: string,
  ): Promise<void> {
    const [dependencyRun, sourceRun] = await Promise.all([
      this.dependencyIndexRepository.getCurrentCatalogRun(projectId),
      this.sourceIndexRepository.getCurrentCatalogRun(projectId),
    ]);
    if (
      dependencyRun?.id !== dependencyIndexId ||
      dependencyRun.sourceIndexRunId !== sourceIndexRunId ||
      sourceRun?.id !== sourceIndexRunId
    ) {
      throw new ProjectDependencyCatalogStaleError(projectId);
    }
  }
}

interface GraphCandidate {
  readonly edge: ProjectDependencyGraphEdge;
  readonly nodes: readonly ProjectDependencyGraphNode[];
}

function toGraphCandidate(record: ProjectDependencyGraphEdgeRecord, includeBindings: boolean): GraphCandidate {
  const sourceNode = toFileNode({
    relativePath: record.sourceRelativePath,
    sourceFileId: record.sourceFileId,
  });
  const targetNode = toTargetNode(record);
  return {
    edge: {
      bindings: includeBindings ? [...record.bindings] : [],
      externalPackage: record.externalPackage,
      id: record.id,
      kind: record.kind,
      range: record.range,
      resolutionKind: record.resolutionKind,
      sourceFileId: record.sourceFileId,
      sourceNodeId: sourceNode.id,
      sourcePath: record.sourceRelativePath,
      specifier: record.specifier,
      specifierRange: record.specifierRange,
      targetNodeId: targetNode?.id ?? null,
      targetPath: record.targetRelativePath,
      targetSourceFileId: record.targetSourceFileId,
      typeOnly: record.typeOnly,
      unresolvedReason: record.unresolvedReason,
    },
    nodes: targetNode === null ? [sourceNode] : [sourceNode, targetNode],
  };
}

function toTargetNode(record: ProjectDependencyGraphEdgeRecord): ProjectDependencyGraphNode | null {
  if (record.resolutionKind === "local" && record.targetSourceFileId !== null && record.targetRelativePath !== null) {
    return toFileNode({
      relativePath: record.targetRelativePath,
      sourceFileId: record.targetSourceFileId,
    });
  }
  if (record.resolutionKind === "external" && record.externalPackage !== null) {
    return {
      id: `external:${record.externalPackage}`,
      kind: "external",
      packageName: record.externalPackage,
    };
  }
  if (record.resolutionKind === "builtin") {
    const moduleName = record.specifier.startsWith("node:") ? record.specifier : `node:${record.specifier}`;
    return {
      id: `builtin:${moduleName}`,
      kind: "builtin",
      moduleName,
    };
  }
  return null;
}

function toFileNode(file: ProjectDependencyGraphFileRecord): ProjectDependencyGraphNode {
  return {
    id: fileNodeId(file.sourceFileId),
    kind: "file",
    path: file.relativePath,
    sourceFileId: file.sourceFileId,
  };
}

function fileNodeId(sourceFileId: string): string {
  return `file:${sourceFileId}`;
}

function discoverFile(fileId: string, discovered: Set<string>, next: Set<string>): void {
  if (!discovered.has(fileId)) {
    discovered.add(fileId);
    next.add(fileId);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEdges(left: ProjectDependencyGraphEdge, right: ProjectDependencyGraphEdge): number {
  return (
    compareText(left.sourcePath, right.sourcePath) ||
    left.range.startByte - right.range.startByte ||
    compareText(left.id, right.id)
  );
}

function isPublicGraphError(error: unknown): boolean {
  return (
    error instanceof InvalidProjectPathError ||
    error instanceof ProjectDependencyCatalogRequiredError ||
    error instanceof ProjectDependencyCatalogStaleError ||
    error instanceof ProjectDependencyGraphFailedError ||
    error instanceof ProjectDependencyPathNotFoundError ||
    error instanceof ProjectNotFoundError
  );
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
