import { ProjectSymbolIndexSchema, type ProjectSymbolIndex } from "@arc/contracts";
import { Op, Transaction, UniqueConstraintError } from "sequelize";

import type { ArcDatabase, ProjectSymbolIndexRunAttributes } from "../../../database/database.types.js";
import type { ProjectSymbolIndexRunModel } from "../../../database/models/project-symbol-index-run.model.js";
import type { ProjectSymbolIndexRepository } from "../application/project-symbol-index.repository.js";
import type {
  CurrentProjectSymbolFile,
  FailProjectSymbolIndexInput,
  ProjectSymbolFileOutcome,
  PublishProjectSymbolIndexInput,
} from "../domain/project-symbol-index.types.js";
import { ProjectSymbolIndexAlreadyRunningError } from "../domain/project.errors.js";

export class SequelizeProjectSymbolIndexRepository implements ProjectSymbolIndexRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async beginIndex(projectId: string, sourceIndexRunId: string): Promise<ProjectSymbolIndex> {
    try {
      return toProjectSymbolIndex(
        await this.database.models.projectSymbolIndexRuns.create({
          projectId,
          sourceIndexRunId,
        }),
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ProjectSymbolIndexAlreadyRunningError(projectId);
      }
      throw error;
    }
  }

  public async publishIndex(input: PublishProjectSymbolIndexInput): Promise<ProjectSymbolIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunningIndex(input.symbolIndexId, input.projectId, transaction);
      const parsedAt = new Date();

      await this.reassignReusableFiles(input, transaction);
      await this.upsertFileOutcomes(input, parsedAt, transaction);
      await this.upsertSymbols(input, transaction);

      await this.database.models.projectSymbols.destroy({
        transaction,
        where: {
          projectId: input.projectId,
          symbolIndexRunId: { [Op.ne]: input.symbolIndexId },
        },
      });
      await this.database.models.projectSymbolFiles.destroy({
        transaction,
        where: {
          projectId: input.projectId,
          symbolIndexRunId: { [Op.ne]: input.symbolIndexId },
        },
      });

      run.set({
        completedAt: parsedAt,
        errorCode: null,
        failedFileCount: input.failedFileCount,
        limitReasons: [...input.limitReasons],
        omittedSymbolCount: input.omittedSymbolCount,
        parsedFileCount: input.parsedFileCount,
        reusedFileCount: input.reusedFileCount,
        status: input.limitReasons.length === 0 ? "completed" : "limited",
        symbolCount: input.symbolCount,
        unsupportedFileCount: input.unsupportedFileCount,
      });
      await run.save({ transaction });
      return toProjectSymbolIndex(run);
    });
  }

  public async failIndex(input: FailProjectSymbolIndexInput): Promise<ProjectSymbolIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunningIndex(input.symbolIndexId, input.projectId, transaction);
      run.set({
        completedAt: new Date(),
        errorCode: input.errorCode,
        limitReasons: [],
        status: "failed",
      });
      await run.save({ transaction });
      return toProjectSymbolIndex(run);
    });
  }

  public async getCurrentFiles(projectId: string): Promise<readonly CurrentProjectSymbolFile[]> {
    const files = await this.database.models.projectSymbolFiles.findAll({
      order: [
        ["relativePath", "ASC"],
        ["id", "ASC"],
      ],
      where: { projectId },
    });
    return files.map((file) => {
      const attributes = file.get();
      return {
        hasSyntaxErrors: attributes.hasSyntaxErrors,
        language: attributes.language,
        omittedSymbolCount: attributes.omittedSymbolCount,
        parserIdentity: attributes.parserIdentity,
        sourceContentHash: attributes.sourceContentHash,
        sourceFileId: attributes.sourceFileId,
        status: attributes.status,
        symbolCount: attributes.symbolCount,
      };
    });
  }

  public async getCurrentCatalogRun(projectId: string): Promise<ProjectSymbolIndex | null> {
    const run = await this.database.models.projectSymbolIndexRuns.findOne({
      order: [
        ["completedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: {
        projectId,
        status: { [Op.in]: ["completed", "limited"] },
      },
    });
    return run === null ? null : toProjectSymbolIndex(run);
  }

  public async getLatestRun(projectId: string): Promise<ProjectSymbolIndex | null> {
    const run = await this.database.models.projectSymbolIndexRuns.findOne({
      order: [
        ["startedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId },
    });
    return run === null ? null : toProjectSymbolIndex(run);
  }

  public async recoverInterruptedIndexes(): Promise<number> {
    const [updatedCount] = await this.database.models.projectSymbolIndexRuns.update(
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

  private async reassignReusableFiles(input: PublishProjectSymbolIndexInput, transaction: Transaction): Promise<void> {
    if (input.reusedSourceFileIds.length === 0) {
      return;
    }

    const [updatedFiles] = await this.database.models.projectSymbolFiles.update(
      { symbolIndexRunId: input.symbolIndexId },
      {
        transaction,
        where: {
          projectId: input.projectId,
          sourceFileId: { [Op.in]: [...input.reusedSourceFileIds] },
        },
      },
    );
    if (updatedFiles !== input.reusedSourceFileIds.length) {
      throw new Error("Arc reusable symbol-file state changed before publication.");
    }

    await this.database.models.projectSymbols.update(
      { symbolIndexRunId: input.symbolIndexId },
      {
        transaction,
        where: {
          projectId: input.projectId,
          sourceFileId: { [Op.in]: [...input.reusedSourceFileIds] },
        },
      },
    );
  }

  private async upsertFileOutcomes(
    input: PublishProjectSymbolIndexInput,
    parsedAt: Date,
    transaction: Transaction,
  ): Promise<void> {
    for (let offset = 0; offset < input.files.length; offset += input.batchSize) {
      const batch = input.files.slice(offset, offset + input.batchSize).map((file) => ({
        errorCode: file.errorCode,
        hasSyntaxErrors: file.hasSyntaxErrors,
        language: file.language,
        omittedSymbolCount: file.omittedSymbolCount,
        parsedAt,
        parserIdentity: file.parserIdentity,
        projectId: input.projectId,
        relativePath: file.relativePath,
        sourceContentHash: file.sourceContentHash,
        sourceFileId: file.sourceFileId,
        status: file.status,
        symbolCount: file.symbolCount,
        symbolIndexRunId: input.symbolIndexId,
      }));
      await this.database.models.projectSymbolFiles.bulkCreate(batch, {
        conflictAttributes: ["projectId", "sourceFileId"],
        transaction,
        updateOnDuplicate: [
          "errorCode",
          "hasSyntaxErrors",
          "language",
          "omittedSymbolCount",
          "parsedAt",
          "parserIdentity",
          "relativePath",
          "sourceContentHash",
          "status",
          "symbolCount",
          "symbolIndexRunId",
        ],
      });
    }
  }

  private async upsertSymbols(input: PublishProjectSymbolIndexInput, transaction: Transaction): Promise<void> {
    const changedFiles = input.files.filter((file) => file.symbols.length > 0);
    if (changedFiles.length === 0) {
      return;
    }

    const symbolFiles = await this.database.models.projectSymbolFiles.findAll({
      transaction,
      where: {
        projectId: input.projectId,
        sourceFileId: { [Op.in]: changedFiles.map((file) => file.sourceFileId) },
      },
    });
    const symbolFileIds = new Map(symbolFiles.map((file) => [file.sourceFileId, file.id]));
    const symbols = changedFiles.flatMap((file) => this.toSymbolRows(input, file, symbolFileIds));

    for (let offset = 0; offset < symbols.length; offset += input.batchSize) {
      await this.database.models.projectSymbols.bulkCreate(symbols.slice(offset, offset + input.batchSize), {
        conflictAttributes: ["symbolFileId", "identityKey"],
        transaction,
        updateOnDuplicate: [
          "endByte",
          "endColumnByte",
          "endLine",
          "exported",
          "kind",
          "name",
          "parentIdentityKey",
          "projectId",
          "qualifiedName",
          "sourceFileId",
          "startByte",
          "startColumnByte",
          "startLine",
          "symbolIndexRunId",
        ],
      });
    }
  }

  private toSymbolRows(
    input: PublishProjectSymbolIndexInput,
    file: ProjectSymbolFileOutcome,
    symbolFileIds: ReadonlyMap<string, string>,
  ) {
    const symbolFileId = symbolFileIds.get(file.sourceFileId);
    if (symbolFileId === undefined) {
      throw new Error("Arc could not resolve a published symbol-file row.");
    }
    return file.symbols.map((symbol) => ({
      endByte: symbol.range.endByte,
      endColumnByte: symbol.range.endColumnByte,
      endLine: symbol.range.endLine,
      exported: symbol.exported,
      identityKey: symbol.identityKey,
      kind: symbol.kind,
      name: symbol.name,
      parentIdentityKey: symbol.parentIdentityKey,
      projectId: input.projectId,
      qualifiedName: symbol.qualifiedName,
      sourceFileId: file.sourceFileId,
      startByte: symbol.range.startByte,
      startColumnByte: symbol.range.startColumnByte,
      startLine: symbol.range.startLine,
      symbolFileId,
      symbolIndexRunId: input.symbolIndexId,
    }));
  }

  private async findRunningIndex(
    symbolIndexId: string,
    projectId: string,
    transaction: Transaction,
  ): Promise<ProjectSymbolIndexRunModel> {
    const run = await this.database.models.projectSymbolIndexRuns.findOne({
      lock: Transaction.LOCK.UPDATE,
      transaction,
      where: { id: symbolIndexId, projectId, status: "running" },
    });
    if (run === null) {
      throw new Error("Arc project symbol index is no longer running.");
    }
    return run;
  }
}

function toProjectSymbolIndex(run: ProjectSymbolIndexRunModel): ProjectSymbolIndex {
  return toProjectSymbolIndexAttributes(run.get());
}

function toProjectSymbolIndexAttributes(attributes: ProjectSymbolIndexRunAttributes): ProjectSymbolIndex {
  return ProjectSymbolIndexSchema.parse({
    completedAt: attributes.completedAt?.toISOString() ?? null,
    errorCode: attributes.errorCode,
    failedFileCount: attributes.failedFileCount,
    id: attributes.id,
    limitReasons: attributes.limitReasons,
    omittedSymbolCount: attributes.omittedSymbolCount,
    parsedFileCount: attributes.parsedFileCount,
    projectId: attributes.projectId,
    reusedFileCount: attributes.reusedFileCount,
    sourceIndexRunId: attributes.sourceIndexRunId,
    startedAt: attributes.startedAt.toISOString(),
    status: attributes.status,
    symbolCount: attributes.symbolCount,
    unsupportedFileCount: attributes.unsupportedFileCount,
  });
}
