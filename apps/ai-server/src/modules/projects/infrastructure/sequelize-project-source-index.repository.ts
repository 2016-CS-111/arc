import { ProjectSourceIndexSchema, type ProjectSourceIndex } from "@arc/contracts";
import { Op, Transaction, UniqueConstraintError } from "sequelize";

import type { ArcDatabase, ProjectSourceIndexRunAttributes } from "../../../database/database.types.js";
import type { ProjectSourceIndexRunModel } from "../../../database/models/project-source-index-run.model.js";
import type { ProjectSourceIndexRepository } from "../application/project-source-index.repository.js";
import type {
  CompleteProjectSourceIndexInput,
  FailProjectSourceIndexInput,
  ProjectSourceCatalogSnapshot,
} from "../domain/project-source-index.types.js";
import { ProjectSourceIndexAlreadyRunningError } from "../domain/project.errors.js";

export class SequelizeProjectSourceIndexRepository implements ProjectSourceIndexRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async beginIndex(projectId: string, inventoryScanId: string): Promise<ProjectSourceIndex> {
    try {
      return toProjectSourceIndex(
        await this.database.models.projectSourceIndexRuns.create({
          inventoryScanId,
          projectId,
        }),
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ProjectSourceIndexAlreadyRunningError(projectId);
      }
      throw error;
    }
  }

  public async completeIndex(input: CompleteProjectSourceIndexInput): Promise<ProjectSourceIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunningIndex(input.sourceIndexId, input.projectId, transaction);
      const indexedAt = new Date();

      for (let offset = 0; offset < input.files.length; offset += input.batchSize) {
        const batch = input.files.slice(offset, offset + input.batchSize).map((file) => ({
          contentHash: file.contentHash,
          indexedAt,
          inventoryScanId: input.inventoryScanId,
          language: file.language,
          modifiedAt: new Date(file.modifiedAt),
          projectId: input.projectId,
          relativePath: file.relativePath,
          sizeBytes: file.sizeBytes,
          skipReason: file.skipReason,
          sourceIndexRunId: input.sourceIndexId,
          status: file.status,
        }));
        await this.database.models.projectSourceFiles.bulkCreate(batch, {
          conflictAttributes: ["projectId", "relativePath"],
          transaction,
          updateOnDuplicate: [
            "contentHash",
            "indexedAt",
            "inventoryScanId",
            "language",
            "modifiedAt",
            "sizeBytes",
            "skipReason",
            "sourceIndexRunId",
            "status",
          ],
        });
      }

      await this.database.models.projectSourceFiles.destroy({
        transaction,
        where: {
          projectId: input.projectId,
          sourceIndexRunId: { [Op.ne]: input.sourceIndexId },
        },
      });

      run.set({
        completedAt: indexedAt,
        errorCode: null,
        inspectedBytes: input.inspectedBytes,
        limitReasons: input.limitReasons,
        readyBytes: input.readyBytes,
        readyFileCount: input.readyFileCount,
        skippedFileCount: input.skippedFileCount,
        status: input.limitReasons.length === 0 ? "completed" : "limited",
      });
      await run.save({ transaction });

      return toProjectSourceIndex(run);
    });
  }

  public async failIndex(input: FailProjectSourceIndexInput): Promise<ProjectSourceIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunningIndex(input.sourceIndexId, input.projectId, transaction);
      run.set({
        completedAt: new Date(),
        errorCode: input.errorCode,
        limitReasons: [],
        status: "failed",
      });
      await run.save({ transaction });
      return toProjectSourceIndex(run);
    });
  }

  public async getCurrentCatalogRun(projectId: string): Promise<ProjectSourceIndex | null> {
    const run = await this.database.models.projectSourceIndexRuns.findOne({
      order: [
        ["completedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: {
        projectId,
        status: { [Op.in]: ["completed", "limited"] },
      },
    });
    return run === null ? null : toProjectSourceIndex(run);
  }

  public async getCurrentReadyCatalog(projectId: string): Promise<ProjectSourceCatalogSnapshot | null> {
    const run = await this.getCurrentCatalogRun(projectId);
    if (run === null) {
      return null;
    }

    const files = await this.database.models.projectSourceFiles.findAll({
      order: [
        ["relativePath", "ASC"],
        ["id", "ASC"],
      ],
      where: {
        projectId,
        sourceIndexRunId: run.id,
        status: "ready",
      },
    });

    return {
      files: files.map((file) => {
        const attributes = file.get();
        if (attributes.contentHash === null || attributes.language === null) {
          throw new Error("Arc source catalog returned an invalid ready file.");
        }
        return {
          contentHash: attributes.contentHash,
          id: attributes.id,
          language: attributes.language,
          modifiedAt: attributes.modifiedAt.toISOString(),
          relativePath: attributes.relativePath,
          sizeBytes: toSafeInteger(attributes.sizeBytes),
        };
      }),
      run,
    };
  }

  public async getLatestRun(projectId: string): Promise<ProjectSourceIndex | null> {
    const run = await this.database.models.projectSourceIndexRuns.findOne({
      order: [
        ["startedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId },
    });
    return run === null ? null : toProjectSourceIndex(run);
  }

  public async recoverInterruptedIndexes(): Promise<number> {
    const [updatedCount] = await this.database.models.projectSourceIndexRuns.update(
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

  private async findRunningIndex(
    sourceIndexId: string,
    projectId: string,
    transaction: Transaction,
  ): Promise<ProjectSourceIndexRunModel> {
    const run = await this.database.models.projectSourceIndexRuns.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { id: sourceIndexId, projectId, status: "running" },
    });
    if (run === null) {
      throw new Error("Arc project source index is no longer running.");
    }
    return run;
  }
}

function toProjectSourceIndex(run: ProjectSourceIndexRunModel): ProjectSourceIndex {
  return toProjectSourceIndexAttributes(run.get());
}

function toProjectSourceIndexAttributes(attributes: ProjectSourceIndexRunAttributes): ProjectSourceIndex {
  return ProjectSourceIndexSchema.parse({
    completedAt: attributes.completedAt?.toISOString() ?? null,
    errorCode: attributes.errorCode,
    id: attributes.id,
    inspectedBytes: toSafeInteger(attributes.inspectedBytes),
    inventoryScanId: attributes.inventoryScanId,
    limitReasons: attributes.limitReasons,
    projectId: attributes.projectId,
    readyBytes: toSafeInteger(attributes.readyBytes),
    readyFileCount: attributes.readyFileCount,
    skippedFileCount: attributes.skippedFileCount,
    startedAt: attributes.startedAt.toISOString(),
    status: attributes.status,
  });
}

function toSafeInteger(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Sequelize returned an invalid Arc source index size.");
  }
  return parsed;
}
