import { ProjectScanSchema, type ProjectScan } from "@arc/contracts";
import { Transaction, UniqueConstraintError } from "sequelize";

import type { ProjectScanAttributes, ArcDatabase } from "../../../database/database.types.js";
import type { ProjectScanModel } from "../../../database/models/project-scan.model.js";
import type { ProjectInventoryRepository } from "../application/project-inventory.repository.js";
import type { CompleteProjectScanInput, FailProjectScanInput } from "../domain/project-inventory.types.js";
import { ProjectScanAlreadyRunningError } from "../domain/project.errors.js";

export class SequelizeProjectInventoryRepository implements ProjectInventoryRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async beginScan(projectId: string): Promise<ProjectScan> {
    try {
      return toProjectScan(await this.database.models.projectScans.create({ projectId }));
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ProjectScanAlreadyRunningError(projectId);
      }

      throw error;
    }
  }

  public async completeScan(input: CompleteProjectScanInput): Promise<ProjectScan> {
    return this.database.sequelize.transaction(async (transaction) => {
      const scan = await this.findRunningScan(input.scanId, input.projectId, transaction);
      await this.database.models.projectFiles.destroy({
        transaction,
        where: { projectId: input.projectId },
      });

      for (let offset = 0; offset < input.files.length; offset += input.batchSize) {
        const batch = input.files.slice(offset, offset + input.batchSize).map((file) => ({
          modifiedAt: new Date(file.modifiedAt),
          projectId: input.projectId,
          relativePath: file.path,
          scanId: input.scanId,
          sizeBytes: file.sizeBytes,
        }));
        await this.database.models.projectFiles.bulkCreate(batch, { transaction });
      }

      scan.set({
        completedAt: new Date(),
        errorCode: null,
        fileCount: input.files.length,
        ignoredPathCount: input.ignoredPathCount,
        limitReasons: input.limitReasons,
        skippedSymlinkCount: input.skippedSymlinkCount,
        status: input.limitReasons.length === 0 ? "completed" : "limited",
        totalBytes: input.totalBytes,
      });
      await scan.save({ transaction });

      return toProjectScan(scan);
    });
  }

  public async failScan(input: FailProjectScanInput): Promise<ProjectScan> {
    return this.database.sequelize.transaction(async (transaction) => {
      const scan = await this.findRunningScan(input.scanId, input.projectId, transaction);
      scan.set({
        completedAt: new Date(),
        errorCode: input.errorCode,
        limitReasons: [],
        status: "failed",
      });
      await scan.save({ transaction });
      return toProjectScan(scan);
    });
  }

  public async getLatestScan(projectId: string): Promise<ProjectScan | null> {
    const scan = await this.database.models.projectScans.findOne({
      order: [
        ["startedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId },
    });

    return scan === null ? null : toProjectScan(scan);
  }

  private async findRunningScan(
    scanId: string,
    projectId: string,
    transaction: Transaction,
  ): Promise<ProjectScanModel> {
    const scan = await this.database.models.projectScans.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { id: scanId, projectId, status: "running" },
    });
    if (scan === null) {
      throw new Error("Arc project scan is no longer running.");
    }

    return scan;
  }
}

function toProjectScan(scan: ProjectScanModel): ProjectScan {
  return toProjectScanAttributes(scan.get());
}

function toProjectScanAttributes(attributes: ProjectScanAttributes): ProjectScan {
  return ProjectScanSchema.parse({
    completedAt: attributes.completedAt?.toISOString() ?? null,
    errorCode: attributes.errorCode,
    fileCount: attributes.fileCount,
    id: attributes.id,
    ignoredPathCount: attributes.ignoredPathCount,
    limitReasons: attributes.limitReasons,
    projectId: attributes.projectId,
    skippedSymlinkCount: attributes.skippedSymlinkCount,
    startedAt: attributes.startedAt.toISOString(),
    status: attributes.status,
    totalBytes: toSafeInteger(attributes.totalBytes),
  });
}

function toSafeInteger(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Sequelize returned an invalid Arc project inventory size.");
  }

  return parsed;
}
