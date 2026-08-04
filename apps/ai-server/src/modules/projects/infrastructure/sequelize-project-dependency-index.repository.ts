import { ProjectDependencyIndexSchema, type ProjectDependencyIndex } from "@arc/contracts";
import { Op, Transaction, UniqueConstraintError, type WhereOptions } from "sequelize";

import type {
  ArcDatabase,
  ProjectDependencyBindingAttributes,
  ProjectDependencyEdgeAttributes,
  ProjectDependencyIndexRunAttributes,
} from "../../../database/database.types.js";
import type { ProjectDependencyIndexRunModel } from "../../../database/models/project-dependency-index-run.model.js";
import type { ProjectDependencyIndexRepository } from "../application/project-dependency-index.repository.js";
import type {
  CurrentProjectDependencyFile,
  ExtractedSourceDependency,
  ExtractedSourceDependencyBinding,
  FailProjectDependencyIndexInput,
  FindProjectDependencyGraphEdgesInput,
  FindProjectDependencyGraphFileInput,
  ListProjectDependencyCatalogInput,
  ProjectDependencyCatalogPage,
  ProjectDependencyGraphBindingRecord,
  ProjectDependencyGraphEdgePage,
  ProjectDependencyGraphEdgeRecord,
  ProjectDependencyGraphFileRecord,
  ProjectDependencyFileOutcome,
  PublishProjectDependencyIndexInput,
} from "../domain/project-dependency-index.types.js";
import type { ProjectModuleResolution } from "../domain/project-module-resolution.types.js";
import { ProjectDependencyIndexAlreadyRunningError } from "../domain/project.errors.js";

export class SequelizeProjectDependencyIndexRepository implements ProjectDependencyIndexRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async beginIndex(projectId: string, sourceIndexRunId: string): Promise<ProjectDependencyIndex> {
    try {
      return toProjectDependencyIndex(
        await this.database.models.projectDependencyIndexRuns.create({
          projectId,
          sourceIndexRunId,
        }),
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ProjectDependencyIndexAlreadyRunningError(projectId);
      }
      throw error;
    }
  }

  public async publishIndex(input: PublishProjectDependencyIndexInput): Promise<ProjectDependencyIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunningIndex(input.dependencyIndexId, input.projectId, transaction);
      const completedAt = new Date();

      await this.upsertFileOutcomes(input, transaction);
      const fileIds = await this.getPublishedFileIds(input, transaction);
      await this.upsertEdges(input, fileIds, transaction);
      const edgeIds = await this.getPublishedEdgeIds(input, fileIds, transaction);
      await this.upsertBindings(input, edgeIds, transaction);
      await this.removeStaleGraph(input, transaction);

      run.set({
        bindingCount: input.bindingCount,
        builtinEdgeCount: input.builtinEdgeCount,
        completedAt,
        edgeCount: input.edgeCount,
        errorCode: null,
        externalEdgeCount: input.externalEdgeCount,
        failedFileCount: input.failedFileCount,
        limitReasons: [...input.limitReasons],
        localEdgeCount: input.localEdgeCount,
        omittedBindingCount: input.omittedBindingCount,
        omittedEdgeCount: input.omittedEdgeCount,
        parsedFileCount: input.parsedFileCount,
        resolutionContextHash: input.resolutionContextHash,
        resolverWarnings: [...input.resolverWarnings],
        reusedFileCount: input.reusedFileCount,
        status: input.limitReasons.length === 0 ? "completed" : "limited",
        unresolvedEdgeCount: input.unresolvedEdgeCount,
        unsupportedFileCount: input.unsupportedFileCount,
      });
      await run.save({ transaction });
      return toProjectDependencyIndex(run);
    });
  }

  public async failIndex(input: FailProjectDependencyIndexInput): Promise<ProjectDependencyIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunningIndex(input.dependencyIndexId, input.projectId, transaction);
      run.set({
        completedAt: new Date(),
        errorCode: input.errorCode,
        limitReasons: [],
        resolutionContextHash: input.resolutionContextHash ?? run.resolutionContextHash,
        resolverWarnings: [...(input.resolverWarnings ?? run.resolverWarnings)],
        status: "failed",
      });
      await run.save({ transaction });
      return toProjectDependencyIndex(run);
    });
  }

  public async getCurrentFiles(projectId: string): Promise<readonly CurrentProjectDependencyFile[]> {
    const [files, edges, bindings] = await Promise.all([
      this.database.models.projectDependencyFiles.findAll({
        order: [
          ["relativePath", "ASC"],
          ["id", "ASC"],
        ],
        where: { projectId },
      }),
      this.database.models.projectDependencyEdges.findAll({
        order: [
          ["startByte", "ASC"],
          ["extractionKey", "ASC"],
          ["id", "ASC"],
        ],
        where: { projectId },
      }),
      this.database.models.projectDependencyBindings.findAll({
        order: [
          ["bindingKey", "ASC"],
          ["id", "ASC"],
        ],
        where: { projectId },
      }),
    ]);

    const bindingsByEdge = groupBy(
      bindings.map((binding) => binding.get()),
      (binding) => binding.dependencyEdgeId,
    );
    const edgesByFile = groupBy(
      edges.map((edge) => ({ attributes: edge.get(), id: edge.id })),
      (edge) => edge.attributes.dependencyFileId,
    );

    return files.map((file) => {
      const attributes = file.get();
      const dependencies = (edgesByFile.get(attributes.id) ?? []).map((edge) =>
        toExtractedDependency(edge.attributes, bindingsByEdge.get(edge.id) ?? []),
      );
      return {
        bindingCount: attributes.bindingCount,
        dependencies,
        edgeCount: attributes.edgeCount,
        errorCode: attributes.errorCode,
        extractedAt: attributes.extractedAt.toISOString(),
        extractorIdentity: attributes.extractorIdentity,
        hasSyntaxErrors: attributes.hasSyntaxErrors,
        language: attributes.language,
        omittedBindingCount: attributes.omittedBindingCount,
        omittedEdgeCount: attributes.omittedEdgeCount,
        relativePath: attributes.relativePath,
        sourceContentHash: attributes.sourceContentHash,
        sourceFileId: attributes.sourceFileId,
        status: attributes.status,
      };
    });
  }

  public async getCurrentCatalogRun(projectId: string): Promise<ProjectDependencyIndex | null> {
    const run = await this.database.models.projectDependencyIndexRuns.findOne({
      order: [
        ["completedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: {
        projectId,
        status: { [Op.in]: ["completed", "limited"] },
      },
    });
    return run === null ? null : toProjectDependencyIndex(run);
  }

  public async findGraphFile(
    input: FindProjectDependencyGraphFileInput,
  ): Promise<ProjectDependencyGraphFileRecord | null> {
    const file = await this.database.models.projectDependencyFiles.findOne({
      where: {
        dependencyIndexRunId: input.dependencyIndexId,
        projectId: input.projectId,
        relativePath: input.relativePath,
      },
    });
    return file === null
      ? null
      : {
          relativePath: file.relativePath,
          sourceFileId: file.sourceFileId,
        };
  }

  public async findGraphEdges(input: FindProjectDependencyGraphEdgesInput): Promise<ProjectDependencyGraphEdgePage> {
    if (input.frontierSourceFileIds.length === 0) {
      return { edges: [], hasMore: false };
    }

    const conditions: WhereOptions<ProjectDependencyEdgeAttributes>[] = [
      graphDirectionWhere(input.direction, input.frontierSourceFileIds),
    ];
    if (input.dependencyKinds.length > 0) {
      conditions.push({ kind: { [Op.in]: [...input.dependencyKinds] } });
    }
    if (input.resolutionKinds.length > 0) {
      conditions.push({ resolutionKind: { [Op.in]: [...input.resolutionKinds] } });
    }
    if (input.excludedEdgeIds.length > 0) {
      conditions.push({ id: { [Op.notIn]: [...input.excludedEdgeIds] } });
    }

    const candidates = await this.database.models.projectDependencyEdges.findAll({
      limit: input.limit + 1,
      order: [
        ["sourceFileId", "ASC"],
        ["startByte", "ASC"],
        ["extractionKey", "ASC"],
        ["id", "ASC"],
      ],
      where: {
        [Op.and]: conditions,
        dependencyIndexRunId: input.dependencyIndexId,
        projectId: input.projectId,
      },
    });
    const hasMore = candidates.length > input.limit;
    const selected = candidates.slice(0, input.limit);
    if (selected.length === 0) {
      return { edges: [], hasMore };
    }

    const sourceFileIds = [...new Set(selected.map((edge) => edge.sourceFileId))];
    const sourceFiles = await this.database.models.projectDependencyFiles.findAll({
      where: {
        dependencyIndexRunId: input.dependencyIndexId,
        projectId: input.projectId,
        sourceFileId: { [Op.in]: sourceFileIds },
      },
    });
    const sourcePaths = new Map(sourceFiles.map((file) => [file.sourceFileId, file.relativePath]));
    if (sourcePaths.size !== sourceFileIds.length) {
      throw new Error("Arc dependency graph contains an edge without a current source file.");
    }

    const bindingsByEdge = input.includeBindings
      ? await this.getGraphBindings(
          input.projectId,
          input.dependencyIndexId,
          selected.map((edge) => edge.id),
        )
      : new Map<string, readonly ProjectDependencyGraphBindingRecord[]>();

    return {
      edges: selected.map((edge) => {
        const sourceRelativePath = sourcePaths.get(edge.sourceFileId);
        if (sourceRelativePath === undefined) {
          throw new Error("Arc dependency graph contains an edge without a current source path.");
        }
        return toGraphEdgeRecord(edge.get(), sourceRelativePath, bindingsByEdge.get(edge.id) ?? []);
      }),
      hasMore,
    };
  }

  public async getLatestRun(projectId: string): Promise<ProjectDependencyIndex | null> {
    const run = await this.database.models.projectDependencyIndexRuns.findOne({
      order: [
        ["startedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId },
    });
    return run === null ? null : toProjectDependencyIndex(run);
  }

  public async listCatalogDependencies(
    input: ListProjectDependencyCatalogInput,
  ): Promise<ProjectDependencyCatalogPage> {
    validateCatalogPage(input.offset, input.limit);
    if (input.sourceFileIds?.length === 0) {
      return { dependencies: [], hasMore: false };
    }

    const where: WhereOptions<ProjectDependencyEdgeAttributes> = {
      dependencyIndexRunId: input.dependencyIndexId,
      projectId: input.projectId,
      ...(input.sourceFileIds === undefined ? {} : { sourceFileId: { [Op.in]: [...input.sourceFileIds] } }),
    };
    const candidates = await this.database.models.projectDependencyEdges.findAll({
      limit: input.limit + 1,
      offset: input.offset,
      order: [
        ["sourceFileId", "ASC"],
        ["startByte", "ASC"],
        ["extractionKey", "ASC"],
        ["id", "ASC"],
      ],
      where,
    });
    const hasMore = candidates.length > input.limit;
    const selected = candidates.slice(0, input.limit);
    if (selected.length === 0) {
      return { dependencies: [], hasMore };
    }

    const sourceFileIds = [...new Set(selected.map((edge) => edge.sourceFileId))];
    const sourceFiles = await this.database.models.projectDependencyFiles.findAll({
      where: {
        dependencyIndexRunId: input.dependencyIndexId,
        projectId: input.projectId,
        sourceFileId: { [Op.in]: sourceFileIds },
      },
    });
    const sourcePaths = new Map(sourceFiles.map((file) => [file.sourceFileId, file.relativePath]));
    if (sourcePaths.size !== sourceFileIds.length) {
      throw new Error("Arc dependency catalog contains an edge without a current source file.");
    }
    const bindingsByEdge = input.includeBindings
      ? await this.getGraphBindings(
          input.projectId,
          input.dependencyIndexId,
          selected.map((edge) => edge.id),
        )
      : new Map<string, readonly ProjectDependencyGraphBindingRecord[]>();

    return {
      dependencies: selected.map((edge) => {
        const sourceRelativePath = sourcePaths.get(edge.sourceFileId);
        if (sourceRelativePath === undefined) {
          throw new Error("Arc dependency catalog contains an edge without a current source path.");
        }
        return toGraphEdgeRecord(edge.get(), sourceRelativePath, bindingsByEdge.get(edge.id) ?? []);
      }),
      hasMore,
    };
  }

  public async recoverInterruptedIndexes(): Promise<number> {
    const [updatedCount] = await this.database.models.projectDependencyIndexRuns.update(
      {
        completedAt: new Date(),
        errorCode: "index_interrupted",
        limitReasons: [],
        status: "failed",
      },
      {
        where: { status: "running" },
      },
    );
    return updatedCount;
  }

  private async upsertFileOutcomes(input: PublishProjectDependencyIndexInput, transaction: Transaction): Promise<void> {
    for (let offset = 0; offset < input.files.length; offset += input.batchSize) {
      const rows = input.files.slice(offset, offset + input.batchSize).map((file) => ({
        bindingCount: file.bindingCount,
        dependencyIndexRunId: input.dependencyIndexId,
        edgeCount: file.edgeCount,
        errorCode: file.errorCode,
        extractedAt: new Date(file.extractedAt),
        extractorIdentity: file.extractorIdentity,
        hasSyntaxErrors: file.hasSyntaxErrors,
        language: file.language,
        omittedBindingCount: file.omittedBindingCount,
        omittedEdgeCount: file.omittedEdgeCount,
        projectId: input.projectId,
        relativePath: file.relativePath,
        sourceContentHash: file.sourceContentHash,
        sourceFileId: file.sourceFileId,
        status: file.status,
      }));
      await this.database.models.projectDependencyFiles.bulkCreate(rows, {
        conflictAttributes: ["projectId", "sourceFileId"],
        transaction,
        updateOnDuplicate: [
          "bindingCount",
          "dependencyIndexRunId",
          "edgeCount",
          "errorCode",
          "extractedAt",
          "extractorIdentity",
          "hasSyntaxErrors",
          "language",
          "omittedBindingCount",
          "omittedEdgeCount",
          "relativePath",
          "sourceContentHash",
          "status",
        ],
      });
    }
  }

  private async getPublishedFileIds(
    input: PublishProjectDependencyIndexInput,
    transaction: Transaction,
  ): Promise<ReadonlyMap<string, string>> {
    if (input.files.length === 0) {
      return new Map();
    }
    const files = await this.database.models.projectDependencyFiles.findAll({
      transaction,
      where: {
        projectId: input.projectId,
        sourceFileId: { [Op.in]: input.files.map((file) => file.sourceFileId) },
      },
    });
    const fileIds = new Map(files.map((file) => [file.sourceFileId, file.id]));
    if (fileIds.size !== input.files.length) {
      throw new Error("Arc could not resolve every published dependency-file row.");
    }
    return fileIds;
  }

  private async upsertEdges(
    input: PublishProjectDependencyIndexInput,
    fileIds: ReadonlyMap<string, string>,
    transaction: Transaction,
  ): Promise<void> {
    const rows = input.files.flatMap((file) => this.toEdgeRows(input, file, fileIds));
    for (let offset = 0; offset < rows.length; offset += input.batchSize) {
      await this.database.models.projectDependencyEdges.bulkCreate(rows.slice(offset, offset + input.batchSize), {
        conflictAttributes: ["dependencyFileId", "extractionKey"],
        transaction,
        updateOnDuplicate: [
          "dependencyIndexRunId",
          "endByte",
          "endColumnByte",
          "endLine",
          "externalPackage",
          "kind",
          "projectId",
          "resolutionKind",
          "sourceFileId",
          "specifier",
          "specifierEndByte",
          "specifierEndColumnByte",
          "specifierEndLine",
          "specifierStartByte",
          "specifierStartColumnByte",
          "specifierStartLine",
          "startByte",
          "startColumnByte",
          "startLine",
          "targetRelativePath",
          "targetSourceFileId",
          "typeOnly",
          "unresolvedReason",
        ],
      });
    }
  }

  private toEdgeRows(
    input: PublishProjectDependencyIndexInput,
    file: ProjectDependencyFileOutcome,
    fileIds: ReadonlyMap<string, string>,
  ) {
    const dependencyFileId = fileIds.get(file.sourceFileId);
    if (dependencyFileId === undefined) {
      throw new Error("Arc could not resolve a published dependency-file row.");
    }
    return file.dependencies.map((dependency) => ({
      dependencyFileId,
      dependencyIndexRunId: input.dependencyIndexId,
      endByte: dependency.range.endByte,
      endColumnByte: dependency.range.endColumnByte,
      endLine: dependency.range.endLine,
      extractionKey: dependency.extractionKey,
      kind: dependency.kind,
      projectId: input.projectId,
      sourceFileId: file.sourceFileId,
      specifier: dependency.specifier,
      specifierEndByte: dependency.specifierRange.endByte,
      specifierEndColumnByte: dependency.specifierRange.endColumnByte,
      specifierEndLine: dependency.specifierRange.endLine,
      specifierStartByte: dependency.specifierRange.startByte,
      specifierStartColumnByte: dependency.specifierRange.startColumnByte,
      specifierStartLine: dependency.specifierRange.startLine,
      startByte: dependency.range.startByte,
      startColumnByte: dependency.range.startColumnByte,
      startLine: dependency.range.startLine,
      typeOnly: dependency.typeOnly,
      ...toResolutionColumns(dependency.resolution),
    }));
  }

  private async getPublishedEdgeIds(
    input: PublishProjectDependencyIndexInput,
    fileIds: ReadonlyMap<string, string>,
    transaction: Transaction,
  ): Promise<ReadonlyMap<string, string>> {
    const expectedEdgeCount = input.files.reduce((count, file) => count + file.dependencies.length, 0);
    if (expectedEdgeCount === 0) {
      return new Map();
    }
    const edges = await this.database.models.projectDependencyEdges.findAll({
      transaction,
      where: {
        dependencyFileId: { [Op.in]: [...fileIds.values()] },
        projectId: input.projectId,
      },
    });
    const currentKeys = new Set(
      input.files.flatMap((file) => file.dependencies.map((edge) => edgeMapKey(file.sourceFileId, edge.extractionKey))),
    );
    const edgeIds = new Map(
      edges
        .map((edge) => [edgeMapKey(edge.sourceFileId, edge.extractionKey), edge.id] as const)
        .filter(([key]) => currentKeys.has(key)),
    );
    if (edgeIds.size !== expectedEdgeCount) {
      throw new Error("Arc could not resolve every published dependency-edge row.");
    }
    return edgeIds;
  }

  private async upsertBindings(
    input: PublishProjectDependencyIndexInput,
    edgeIds: ReadonlyMap<string, string>,
    transaction: Transaction,
  ): Promise<void> {
    const rows = input.files.flatMap((file) =>
      file.dependencies.flatMap((dependency) => {
        const dependencyEdgeId = edgeIds.get(edgeMapKey(file.sourceFileId, dependency.extractionKey));
        if (dependency.bindings.length === 0) {
          return [];
        }
        if (dependencyEdgeId === undefined) {
          throw new Error("Arc could not resolve a published dependency-edge row.");
        }
        return dependency.bindings.map((binding) => ({
          bindingKey: binding.bindingKey,
          dependencyEdgeId,
          dependencyIndexRunId: input.dependencyIndexId,
          endByte: binding.range?.endByte ?? null,
          endColumnByte: binding.range?.endColumnByte ?? null,
          endLine: binding.range?.endLine ?? null,
          exportedName: binding.exportedName,
          importedName: binding.importedName,
          kind: binding.kind,
          localName: binding.localName,
          projectId: input.projectId,
          sourceFileId: file.sourceFileId,
          startByte: binding.range?.startByte ?? null,
          startColumnByte: binding.range?.startColumnByte ?? null,
          startLine: binding.range?.startLine ?? null,
          typeOnly: binding.typeOnly,
        }));
      }),
    );

    for (let offset = 0; offset < rows.length; offset += input.batchSize) {
      await this.database.models.projectDependencyBindings.bulkCreate(rows.slice(offset, offset + input.batchSize), {
        conflictAttributes: ["dependencyEdgeId", "bindingKey"],
        transaction,
        updateOnDuplicate: [
          "dependencyIndexRunId",
          "endByte",
          "endColumnByte",
          "endLine",
          "exportedName",
          "importedName",
          "kind",
          "localName",
          "projectId",
          "sourceFileId",
          "startByte",
          "startColumnByte",
          "startLine",
          "typeOnly",
        ],
      });
    }
  }

  private async removeStaleGraph(input: PublishProjectDependencyIndexInput, transaction: Transaction): Promise<void> {
    const where = {
      dependencyIndexRunId: { [Op.ne]: input.dependencyIndexId },
      projectId: input.projectId,
    };
    await this.database.models.projectDependencyBindings.destroy({ transaction, where });
    await this.database.models.projectDependencyEdges.destroy({ transaction, where });
    await this.database.models.projectDependencyFiles.destroy({ transaction, where });
  }

  private async findRunningIndex(
    dependencyIndexId: string,
    projectId: string,
    transaction: Transaction,
  ): Promise<ProjectDependencyIndexRunModel> {
    const run = await this.database.models.projectDependencyIndexRuns.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { id: dependencyIndexId, projectId, status: "running" },
    });
    if (run === null) {
      throw new Error("Arc project dependency index is no longer running.");
    }
    return run;
  }

  private async getGraphBindings(
    projectId: string,
    dependencyIndexId: string,
    edgeIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly ProjectDependencyGraphBindingRecord[]>> {
    const bindings = await this.database.models.projectDependencyBindings.findAll({
      order: [
        ["dependencyEdgeId", "ASC"],
        ["bindingKey", "ASC"],
        ["id", "ASC"],
      ],
      where: {
        dependencyEdgeId: { [Op.in]: [...edgeIds] },
        dependencyIndexRunId: dependencyIndexId,
        projectId,
      },
    });
    return groupBy(
      bindings.map((binding) => toGraphBindingRecord(binding.get())),
      (binding) => binding.dependencyEdgeId,
    );
  }
}

interface GraphBindingWithEdge extends ProjectDependencyGraphBindingRecord {
  readonly dependencyEdgeId: string;
}

function graphDirectionWhere(
  direction: FindProjectDependencyGraphEdgesInput["direction"],
  frontierSourceFileIds: readonly string[],
): WhereOptions<ProjectDependencyEdgeAttributes> {
  if (direction === "outgoing") {
    return { sourceFileId: { [Op.in]: [...frontierSourceFileIds] } };
  }
  if (direction === "incoming") {
    return { targetSourceFileId: { [Op.in]: [...frontierSourceFileIds] } };
  }
  return {
    [Op.or]: [
      { sourceFileId: { [Op.in]: [...frontierSourceFileIds] } },
      { targetSourceFileId: { [Op.in]: [...frontierSourceFileIds] } },
    ],
  };
}

function toGraphEdgeRecord(
  edge: ProjectDependencyEdgeAttributes,
  sourceRelativePath: string,
  bindings: readonly ProjectDependencyGraphBindingRecord[],
): ProjectDependencyGraphEdgeRecord {
  return {
    bindings,
    externalPackage: edge.externalPackage,
    id: edge.id,
    kind: edge.kind,
    range: {
      endByte: edge.endByte,
      endColumnByte: edge.endColumnByte,
      endLine: edge.endLine,
      startByte: edge.startByte,
      startColumnByte: edge.startColumnByte,
      startLine: edge.startLine,
    },
    resolutionKind: edge.resolutionKind,
    sourceFileId: edge.sourceFileId,
    sourceRelativePath,
    specifier: edge.specifier,
    specifierRange: {
      endByte: edge.specifierEndByte,
      endColumnByte: edge.specifierEndColumnByte,
      endLine: edge.specifierEndLine,
      startByte: edge.specifierStartByte,
      startColumnByte: edge.specifierStartColumnByte,
      startLine: edge.specifierStartLine,
    },
    targetRelativePath: edge.targetRelativePath,
    targetSourceFileId: edge.targetSourceFileId,
    typeOnly: edge.typeOnly,
    unresolvedReason: edge.unresolvedReason,
  };
}

function toGraphBindingRecord(binding: ProjectDependencyBindingAttributes): GraphBindingWithEdge {
  return {
    bindingKey: binding.bindingKey,
    dependencyEdgeId: binding.dependencyEdgeId,
    exportedName: binding.exportedName,
    importedName: binding.importedName,
    kind: binding.kind,
    localName: binding.localName,
    range:
      binding.startByte === null
        ? null
        : {
            endByte: requireNumber(binding.endByte),
            endColumnByte: requireNumber(binding.endColumnByte),
            endLine: requireNumber(binding.endLine),
            startByte: binding.startByte,
            startColumnByte: requireNumber(binding.startColumnByte),
            startLine: requireNumber(binding.startLine),
          },
    typeOnly: binding.typeOnly,
  };
}

function toExtractedDependency(
  edge: ProjectDependencyEdgeAttributes,
  bindings: readonly ProjectDependencyBindingAttributes[],
): ExtractedSourceDependency {
  return {
    bindings: bindings.map(toExtractedBinding),
    extractionKey: edge.extractionKey,
    kind: edge.kind,
    range: {
      endByte: edge.endByte,
      endColumnByte: edge.endColumnByte,
      endLine: edge.endLine,
      startByte: edge.startByte,
      startColumnByte: edge.startColumnByte,
      startLine: edge.startLine,
    },
    specifier: edge.specifier,
    specifierRange: {
      endByte: edge.specifierEndByte,
      endColumnByte: edge.specifierEndColumnByte,
      endLine: edge.specifierEndLine,
      startByte: edge.specifierStartByte,
      startColumnByte: edge.specifierStartColumnByte,
      startLine: edge.specifierStartLine,
    },
    typeOnly: edge.typeOnly,
  };
}

function toExtractedBinding(binding: ProjectDependencyBindingAttributes): ExtractedSourceDependencyBinding {
  const hasRange = binding.startByte !== null;
  return {
    bindingKey: binding.bindingKey,
    exportedName: binding.exportedName,
    importedName: binding.importedName,
    kind: binding.kind,
    localName: binding.localName,
    range: hasRange
      ? {
          endByte: requireNumber(binding.endByte),
          endColumnByte: requireNumber(binding.endColumnByte),
          endLine: requireNumber(binding.endLine),
          startByte: binding.startByte,
          startColumnByte: requireNumber(binding.startColumnByte),
          startLine: requireNumber(binding.startLine),
        }
      : null,
    typeOnly: binding.typeOnly,
  };
}

function toResolutionColumns(
  resolution: ProjectModuleResolution,
): Pick<
  ProjectDependencyEdgeAttributes,
  "externalPackage" | "resolutionKind" | "targetRelativePath" | "targetSourceFileId" | "unresolvedReason"
> {
  if (resolution.kind === "local") {
    return {
      externalPackage: null,
      resolutionKind: resolution.kind,
      targetRelativePath: resolution.targetRelativePath,
      targetSourceFileId: resolution.targetSourceFileId,
      unresolvedReason: null,
    };
  }
  if (resolution.kind === "external") {
    return {
      externalPackage: resolution.packageName,
      resolutionKind: resolution.kind,
      targetRelativePath: null,
      targetSourceFileId: null,
      unresolvedReason: null,
    };
  }
  if (resolution.kind === "unresolved") {
    return {
      externalPackage: null,
      resolutionKind: resolution.kind,
      targetRelativePath: null,
      targetSourceFileId: null,
      unresolvedReason: resolution.reason,
    };
  }
  return {
    externalPackage: null,
    resolutionKind: resolution.kind,
    targetRelativePath: null,
    targetSourceFileId: null,
    unresolvedReason: null,
  };
}

function toProjectDependencyIndex(run: ProjectDependencyIndexRunModel): ProjectDependencyIndex {
  return toProjectDependencyIndexAttributes(run.get());
}

function toProjectDependencyIndexAttributes(attributes: ProjectDependencyIndexRunAttributes): ProjectDependencyIndex {
  return ProjectDependencyIndexSchema.parse({
    bindingCount: attributes.bindingCount,
    builtinEdgeCount: attributes.builtinEdgeCount,
    completedAt: attributes.completedAt?.toISOString() ?? null,
    edgeCount: attributes.edgeCount,
    errorCode: attributes.errorCode,
    externalEdgeCount: attributes.externalEdgeCount,
    failedFileCount: attributes.failedFileCount,
    id: attributes.id,
    limitReasons: attributes.limitReasons,
    localEdgeCount: attributes.localEdgeCount,
    omittedBindingCount: attributes.omittedBindingCount,
    omittedEdgeCount: attributes.omittedEdgeCount,
    parsedFileCount: attributes.parsedFileCount,
    projectId: attributes.projectId,
    resolutionContextHash: attributes.resolutionContextHash,
    resolverWarnings: attributes.resolverWarnings,
    reusedFileCount: attributes.reusedFileCount,
    sourceIndexRunId: attributes.sourceIndexRunId,
    startedAt: attributes.startedAt.toISOString(),
    status: attributes.status,
    unresolvedEdgeCount: attributes.unresolvedEdgeCount,
    unsupportedFileCount: attributes.unsupportedFileCount,
  });
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = grouped.get(groupKey) ?? [];
    group.push(value);
    grouped.set(groupKey, group);
  }
  return grouped;
}

function edgeMapKey(sourceFileId: string, extractionKey: string): string {
  return `${sourceFileId}\0${extractionKey}`;
}

function requireNumber(value: number | null): number {
  if (value === null) {
    throw new Error("Arc dependency binding has an incomplete source range.");
  }
  return value;
}

function validateCatalogPage(offset: number, limit: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Dependency catalog pagination must use a non-negative offset and positive limit.");
  }
}
