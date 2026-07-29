import { ProjectFrameworkIndexSchema, type ProjectFrameworkIndex } from "@arc/contracts";
import { Op, UniqueConstraintError, type Transaction } from "sequelize";
import type { ArcDatabase } from "../../../database/database.types.js";
import type { ProjectFrameworkIndexRunModel } from "../../../database/models/project-framework-index-run.model.js";
import type {
  BeginProjectFrameworkIndexInput,
  ProjectFrameworkIndexRepository,
  PublishProjectFrameworkIndexInput,
  ReusableProjectFrameworkCatalog,
} from "../domain/project-framework-index.types.js";
import { PROJECT_FRAMEWORK_KINDS, type ProjectFrameworkKind } from "../domain/project-framework.types.js";
import { ProjectFrameworkIndexAlreadyRunningError } from "../domain/project.errors.js";

export class SequelizeProjectFrameworkIndexRepository implements ProjectFrameworkIndexRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async beginIndex(input: BeginProjectFrameworkIndexInput): Promise<ProjectFrameworkIndex> {
    try {
      return toIndex(await this.database.models.projectFrameworkIndexRuns.create(input));
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new ProjectFrameworkIndexAlreadyRunningError(input.projectId);
      throw error;
    }
  }

  public async publishIndex(input: PublishProjectFrameworkIndexInput): Promise<ProjectFrameworkIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunning(input.projectId, input.frameworkIndexId, transaction);
      const scopeIds = new Map<string, string>();
      for (const scope of input.scopes) {
        const [record] = await this.database.models.projectFrameworkScopes.upsert(
          {
            projectId: input.projectId,
            frameworkIndexRunId: input.frameworkIndexId,
            scopeKey: scope.scopeKey,
            framework: scope.framework,
            rootPath: scope.rootPath,
            packageName: scope.packageName,
            contextHash: scope.contextHash,
            evidence: scope.evidence,
          },
          { transaction },
        );
        scopeIds.set(scope.scopeKey, record.id);
      }
      const entityIds = new Map<string, string>();
      const activeFileIds: string[] = [];
      for (const file of input.files) {
        const scopeId = requireValue(scopeIds, file.scopeKey);
        const [fileRecord] = await this.database.models.projectFrameworkFiles.upsert(
          {
            projectId: input.projectId,
            frameworkIndexRunId: input.frameworkIndexId,
            scopeId,
            sourceFileId: file.sourceFileId,
            relativePath: file.relativePath,
            sourceContentHash: file.sourceContentHash,
            language: file.language,
            analyzerIdentity: file.analyzerIdentity,
            extractorIdentity: file.extractorIdentity,
            evidence: file.evidence,
            extractionOmissionCount: file.extractionOmissionCount,
            extractionOmissionReasons: file.extractionOmissionReasons,
            status: file.status,
            hasSyntaxErrors: file.hasSyntaxErrors,
            entityCount: file.entities.length,
            relationshipCount: file.relationships.length,
            omissionCount: file.omissionCount,
            errorCode: file.errorCode,
            analyzedAt: new Date(),
          },
          { transaction },
        );
        activeFileIds.push(fileRecord.id);
        for (const entity of file.entities) {
          const [record] = await this.database.models.projectFrameworkEntities.upsert(
            {
              projectId: input.projectId,
              frameworkIndexRunId: input.frameworkIndexId,
              scopeId,
              frameworkFileId: fileRecord.id,
              sourceFileId: entity.sourceFileId,
              identityKey: entity.identityKey,
              framework: entity.framework,
              entityKind: entity.entityKind,
              name: entity.name,
              relativePath: entity.relativePath,
              symbolId: entity.symbolId,
              evidenceKind: entity.evidenceKind,
              certainty: entity.certainty,
              range: entity.range,
              attributes: entity.attributes,
            },
            { transaction },
          );
          entityIds.set(entity.identityKey, record.id);
        }
      }
      const activeRelationshipIds: string[] = [];
      for (const file of input.files) {
        const scopeId = requireValue(scopeIds, file.scopeKey);
        for (const relationship of file.relationships) {
          const sourceEntityId = requireValue(entityIds, relationship.sourceEntityIdentityKey);
          const [record] = await this.database.models.projectFrameworkRelationships.upsert(
            {
              projectId: input.projectId,
              frameworkIndexRunId: input.frameworkIndexId,
              scopeId,
              sourceEntityId,
              targetEntityId:
                relationship.targetEntityIdentityKey === null
                  ? null
                  : (entityIds.get(relationship.targetEntityIdentityKey) ?? null),
              sourceFileId: relationship.sourceFileId,
              dependencyEdgeId: relationship.dependencyEdgeId,
              symbolId: relationship.symbolId,
              identityKey: relationship.identityKey,
              framework: relationship.framework,
              relationshipKind: relationship.relationshipKind,
              targetName: relationship.targetName,
              evidenceKind: relationship.evidenceKind,
              certainty: relationship.certainty,
              range: relationship.range,
              attributes: relationship.attributes,
            },
            { transaction },
          );
          activeRelationshipIds.push(record.id);
        }
      }
      await this.database.models.projectFrameworkRelationships.destroy({
        transaction,
        where: {
          projectId: input.projectId,
          ...(activeRelationshipIds.length === 0 ? {} : { id: { [Op.notIn]: activeRelationshipIds } }),
        },
      });
      await this.database.models.projectFrameworkEntities.destroy({
        transaction,
        where: { projectId: input.projectId, frameworkIndexRunId: { [Op.ne]: input.frameworkIndexId } },
      });
      await this.database.models.projectFrameworkFiles.destroy({
        transaction,
        where: {
          projectId: input.projectId,
          ...(activeFileIds.length === 0 ? {} : { id: { [Op.notIn]: activeFileIds } }),
        },
      });
      await this.database.models.projectFrameworkScopes.destroy({
        transaction,
        where: { projectId: input.projectId, frameworkIndexRunId: { [Op.ne]: input.frameworkIndexId } },
      });
      const entityCount = input.files.reduce((sum, file) => sum + file.entities.length, 0);
      const relationshipCount = input.files.reduce((sum, file) => sum + file.relationships.length, 0);
      run.set({
        completedAt: new Date(),
        status: input.limitReasons.length === 0 ? "completed" : "limited",
        scopeCount: input.scopes.length,
        analyzedFileCount: input.analyzedFileCount,
        reusedFileCount: input.reusedFileCount,
        unsupportedFileCount: input.unsupportedFileCount,
        failedFileCount: input.failedFileCount,
        entityCount,
        relationshipCount,
        unresolvedRelationshipCount: input.files.reduce(
          (sum, file) =>
            sum +
            file.relationships.filter(
              (relationship) =>
                relationship.certainty === "unresolved" || relationship.targetEntityIdentityKey === null,
            ).length,
          0,
        ),
        omissionCount: input.files.reduce((sum, file) => sum + file.omissionCount, 0),
        limitReasons: [...input.limitReasons],
        warnings: [...input.warnings],
        errorCode: null,
      });
      await run.save({ transaction });
      return toIndex(run);
    });
  }

  public async failIndex(
    projectId: string,
    frameworkIndexId: string,
    errorCode: ProjectFrameworkIndex["errorCode"],
  ): Promise<ProjectFrameworkIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunning(projectId, frameworkIndexId, transaction);
      run.set({ status: "failed", completedAt: new Date(), errorCode: errorCode ?? "unknown_error", limitReasons: [] });
      await run.save({ transaction });
      return toIndex(run);
    });
  }
  public async getLatestRun(projectId: string): Promise<ProjectFrameworkIndex | null> {
    const row = await this.database.models.projectFrameworkIndexRuns.findOne({
      order: [
        ["startedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId },
    });
    return row === null ? null : toIndex(row);
  }
  public async getCurrentCatalogRun(projectId: string): Promise<ProjectFrameworkIndex | null> {
    const row = await this.database.models.projectFrameworkIndexRuns.findOne({
      order: [
        ["completedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId, status: { [Op.in]: ["completed", "limited"] } },
    });
    return row === null ? null : toIndex(row);
  }
  public async getCurrentReusableCatalog(projectId: string): Promise<ReusableProjectFrameworkCatalog | null> {
    const run = await this.getCurrentCatalogRun(projectId);
    if (run === null) return null;
    const [scopeRows, fileRows] = await Promise.all([
      this.database.models.projectFrameworkScopes.findAll({
        order: [
          ["rootPath", "ASC"],
          ["framework", "ASC"],
          ["id", "ASC"],
        ],
        where: { frameworkIndexRunId: run.id, projectId },
      }),
      this.database.models.projectFrameworkFiles.findAll({
        order: [
          ["relativePath", "ASC"],
          ["scopeId", "ASC"],
          ["id", "ASC"],
        ],
        where: { frameworkIndexRunId: run.id, projectId },
      }),
    ]);
    const scopesById = new Map(scopeRows.map((row) => [row.id, row]));
    return {
      run,
      scopes: scopeRows.map((row) => ({
        contextHash: row.contextHash,
        evidence: row.evidence,
        framework: parseFrameworkKind(row.framework),
        packageName: row.packageName,
        rootPath: row.rootPath,
        scopeKey: row.scopeKey,
      })),
      files: fileRows.map((row) => {
        const scope = scopesById.get(row.scopeId);
        if (scope === undefined) throw new Error("Arc framework catalog returned a file without its scope.");
        return {
          analyzerIdentity: row.analyzerIdentity,
          entities: [],
          errorCode: row.errorCode,
          evidence: row.evidence,
          extractorIdentity: row.extractorIdentity,
          extractionOmissionCount: row.extractionOmissionCount,
          extractionOmissionReasons: row.extractionOmissionReasons,
          hasSyntaxErrors: row.hasSyntaxErrors,
          language: row.language,
          omissionCount: row.omissionCount,
          relationships: [],
          relativePath: row.relativePath,
          scopeKey: scope.scopeKey,
          sourceContentHash: row.sourceContentHash,
          sourceFileId: row.sourceFileId,
          status: row.status,
        };
      }),
    };
  }
  public async recoverInterruptedIndexes(): Promise<number> {
    const [count] = await this.database.models.projectFrameworkIndexRuns.update(
      { status: "failed", completedAt: new Date(), errorCode: "index_interrupted", limitReasons: [] },
      { where: { status: "running" } },
    );
    return count;
  }
  private async findRunning(
    projectId: string,
    id: string,
    transaction: Transaction,
  ): Promise<ProjectFrameworkIndexRunModel> {
    const row = await this.database.models.projectFrameworkIndexRuns.findOne({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { id, projectId, status: "running" },
    });
    if (row === null) throw new Error("framework_index_not_running");
    return row;
  }
}

function toIndex(row: ProjectFrameworkIndexRunModel): ProjectFrameworkIndex {
  const value = row.get();
  return ProjectFrameworkIndexSchema.parse({
    ...value,
    startedAt: value.startedAt.toISOString(),
    completedAt: value.completedAt?.toISOString() ?? null,
  });
}
function requireValue(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing framework catalog identity ${key}.`);
  return value;
}

function parseFrameworkKind(value: string): ProjectFrameworkKind {
  const framework = PROJECT_FRAMEWORK_KINDS.find((candidate) => candidate === value);
  if (framework === undefined) throw new Error("Arc framework catalog returned an invalid framework kind.");
  return framework;
}
