import {
  ProjectEmbeddingIndexSchema,
  type ProjectEmbeddingIndex,
  type ProjectEmbeddingIndexErrorCode,
} from "@arc/contracts";
import pgvector from "pgvector";
import { Op, QueryTypes, UniqueConstraintError, type Transaction } from "sequelize";

import type { ArcDatabase } from "../../../database/database.types.js";
import type { ProjectEmbeddingIndexRunModel } from "../../../database/models/project-embedding-index-run.model.js";
import type {
  BeginProjectEmbeddingIndexInput,
  FindReusableProjectEmbeddingChunksInput,
  ProjectEmbeddingIndexRepository,
  PublishProjectEmbeddingIndexInput,
  ReusableProjectEmbeddingChunk,
} from "../domain/project-embedding-index.types.js";
import type {
  ProjectSemanticSearchQuery,
  ProjectSemanticSearchRecord,
} from "../domain/project-semantic-search.types.js";
import { ProjectEmbeddingIndexAlreadyRunningError } from "../domain/project.errors.js";

export class SequelizeProjectEmbeddingIndexRepository implements ProjectEmbeddingIndexRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async beginIndex(input: BeginProjectEmbeddingIndexInput): Promise<ProjectEmbeddingIndex> {
    try {
      return toIndex(await this.database.models.projectEmbeddingIndexRuns.create(input));
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ProjectEmbeddingIndexAlreadyRunningError(input.projectId);
      }
      throw error;
    }
  }

  public async findReusableChunks(
    input: FindReusableProjectEmbeddingChunksInput,
  ): Promise<readonly ReusableProjectEmbeddingChunk[]> {
    const rows = await this.database.models.projectEmbeddingChunks.findAll({
      attributes: ["identityKey", "inputHash", "embedding"],
      where: {
        projectId: input.projectId,
        provider: input.provider,
        model: input.model,
        dimensions: input.dimensions,
        inputFormat: input.inputFormat,
      },
    });

    return rows.map((row) => ({
      embedding: row.embedding,
      identityKey: row.identityKey,
      inputHash: row.inputHash,
    }));
  }

  public async publishIndex(input: PublishProjectEmbeddingIndexInput): Promise<ProjectEmbeddingIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunning(input.projectId, input.embeddingIndexId, transaction);
      const activeFileIds: string[] = [];
      const activeChunkIds: string[] = [];

      for (const file of input.files) {
        const [fileRow] = await this.database.models.projectEmbeddingFiles.upsert(
          {
            projectId: input.projectId,
            embeddingIndexRunId: input.embeddingIndexId,
            sourceFileId: file.sourceFileId,
            relativePath: file.relativePath,
            sourceContentHash: file.sourceContentHash,
            language: file.language,
            status: file.status,
            chunkCount: file.chunks.length,
            indexedAt: new Date(),
          },
          { transaction },
        );
        activeFileIds.push(fileRow.id);

        for (const chunk of file.chunks) {
          const [chunkRow] = await this.database.models.projectEmbeddingChunks.upsert(
            {
              projectId: input.projectId,
              embeddingIndexRunId: input.embeddingIndexId,
              embeddingFileId: fileRow.id,
              sourceFileId: file.sourceFileId,
              identityKey: chunk.identityKey,
              relativePath: file.relativePath,
              language: file.language,
              sourceContentHash: file.sourceContentHash,
              contentHash: chunk.contentHash,
              inputHash: chunk.inputHash,
              inputFormat: input.inputFormat,
              provider: input.provider,
              model: input.model,
              dimensions: input.dimensions,
              ownerSymbolId: chunk.ownerSymbolId,
              ownerSymbolIdentityKey: chunk.ownerSymbolIdentityKey,
              ownerSymbolKind: chunk.ownerSymbolKind,
              ownerSymbolName: chunk.ownerSymbolName,
              ownerSymbolQualifiedName: chunk.ownerSymbolQualifiedName,
              startByte: chunk.range.startByte,
              endByte: chunk.range.endByte,
              startLine: chunk.range.startLine,
              startColumnByte: chunk.range.startColumnByte,
              endLine: chunk.range.endLine,
              endColumnByte: chunk.range.endColumnByte,
              embedding: [...chunk.embedding],
            },
            { transaction },
          );
          activeChunkIds.push(chunkRow.id);
        }
      }

      await this.database.models.projectEmbeddingChunks.destroy({
        transaction,
        where: {
          projectId: input.projectId,
          ...(activeChunkIds.length === 0 ? {} : { id: { [Op.notIn]: activeChunkIds } }),
        },
      });
      await this.database.models.projectEmbeddingFiles.destroy({
        transaction,
        where: {
          projectId: input.projectId,
          ...(activeFileIds.length === 0 ? {} : { id: { [Op.notIn]: activeFileIds } }),
        },
      });

      const chunkCount = input.files.reduce((total, file) => total + file.chunks.length, 0);
      run.set({
        status: input.limitReasons.length === 0 ? "completed" : "limited",
        completedAt: new Date(),
        fileCount: input.files.length,
        chunkCount,
        embeddedChunkCount: input.embeddedChunkCount,
        reusedChunkCount: input.reusedChunkCount,
        limitReasons: [...input.limitReasons],
        errorCode: null,
      });
      await run.save({ transaction });
      return toIndex(run);
    });
  }

  public async failIndex(
    projectId: string,
    embeddingIndexId: string,
    errorCode: ProjectEmbeddingIndexErrorCode,
  ): Promise<ProjectEmbeddingIndex> {
    return this.database.sequelize.transaction(async (transaction) => {
      const run = await this.findRunning(projectId, embeddingIndexId, transaction);
      run.set({
        status: "failed",
        completedAt: new Date(),
        errorCode,
        limitReasons: [],
      });
      await run.save({ transaction });
      return toIndex(run);
    });
  }

  public async getLatestRun(projectId: string): Promise<ProjectEmbeddingIndex | null> {
    const row = await this.database.models.projectEmbeddingIndexRuns.findOne({
      order: [
        ["startedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId },
    });
    return row === null ? null : toIndex(row);
  }

  public async getCurrentCatalogRun(projectId: string): Promise<ProjectEmbeddingIndex | null> {
    const row = await this.database.models.projectEmbeddingIndexRuns.findOne({
      order: [
        ["completedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId, status: { [Op.in]: ["completed", "limited"] } },
    });
    return row === null ? null : toIndex(row);
  }

  public async searchSemantic(input: ProjectSemanticSearchQuery): Promise<readonly ProjectSemanticSearchRecord[]> {
    const bind: unknown[] = [pgvector.toSql([...input.embedding]), input.projectId, input.embeddingIndexId];
    const filters = ["project_id = $2", "embedding_index_run_id = $3"];

    if (input.pathPrefix !== undefined) {
      bind.push(input.pathPrefix);
      const position = bind.length;
      filters.push(
        `(relative_path = $${String(position)} OR ` +
          `left(relative_path, char_length($${String(position)}) + 1) = $${String(position)} || '/')`,
      );
    }
    if (input.languages.length > 0) {
      bind.push([...input.languages]);
      filters.push(`language = ANY($${String(bind.length)}::varchar[])`);
    }

    bind.push(input.limit + 1);
    const rows = await this.database.sequelize.query<SemanticSearchRow>(
      `SELECT
         id AS "chunkId",
         identity_key AS "identityKey",
         source_file_id AS "sourceFileId",
         relative_path AS "path",
         language,
         source_content_hash AS "sourceHash",
         content_hash AS "contentHash",
         owner_symbol_id AS "ownerSymbolId",
         owner_symbol_identity_key AS "ownerSymbolIdentityKey",
         owner_symbol_kind AS "ownerSymbolKind",
         owner_symbol_name AS "ownerSymbolName",
         owner_symbol_qualified_name AS "ownerSymbolQualifiedName",
         start_byte AS "startByte",
         end_byte AS "endByte",
         start_line AS "startLine",
         start_column_byte AS "startColumnByte",
         end_line AS "endLine",
         end_column_byte AS "endColumnByte",
         1 - (embedding <=> $1::vector) AS score
       FROM project_embedding_chunks
       WHERE ${filters.join(" AND ")}
       ORDER BY score DESC, relative_path ASC, start_byte ASC, id ASC
       LIMIT $${String(bind.length)}`,
      {
        bind,
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((row) => ({
      chunkId: row.chunkId,
      identityKey: row.identityKey,
      sourceFileId: row.sourceFileId,
      path: row.path,
      language: row.language,
      sourceHash: row.sourceHash,
      contentHash: row.contentHash,
      range: {
        startByte: row.startByte,
        endByte: row.endByte,
        startLine: row.startLine,
        startColumnByte: row.startColumnByte,
        endLine: row.endLine,
        endColumnByte: row.endColumnByte,
      },
      symbol:
        row.ownerSymbolIdentityKey === null ||
        row.ownerSymbolKind === null ||
        row.ownerSymbolName === null ||
        row.ownerSymbolQualifiedName === null
          ? null
          : {
              id: row.ownerSymbolId,
              identityKey: row.ownerSymbolIdentityKey,
              kind: row.ownerSymbolKind,
              name: row.ownerSymbolName,
              qualifiedName: row.ownerSymbolQualifiedName,
            },
      score: Math.max(-1, Math.min(1, Number(row.score))),
    }));
  }

  public async recoverInterruptedIndexes(): Promise<number> {
    const [count] = await this.database.models.projectEmbeddingIndexRuns.update(
      {
        status: "failed",
        completedAt: new Date(),
        errorCode: "index_interrupted",
        limitReasons: [],
      },
      { where: { status: "running" } },
    );
    return count;
  }

  private async findRunning(
    projectId: string,
    id: string,
    transaction: Transaction,
  ): Promise<ProjectEmbeddingIndexRunModel> {
    const row = await this.database.models.projectEmbeddingIndexRuns.findOne({
      lock: transaction.LOCK.UPDATE,
      transaction,
      where: { id, projectId, status: "running" },
    });
    if (row === null) {
      throw new Error("embedding_index_not_running");
    }
    return row;
  }
}

interface SemanticSearchRow {
  readonly chunkId: string;
  readonly identityKey: string;
  readonly sourceFileId: string;
  readonly path: string;
  readonly language: string;
  readonly sourceHash: string;
  readonly contentHash: string;
  readonly ownerSymbolId: string | null;
  readonly ownerSymbolIdentityKey: string | null;
  readonly ownerSymbolKind: string | null;
  readonly ownerSymbolName: string | null;
  readonly ownerSymbolQualifiedName: string | null;
  readonly startByte: number;
  readonly endByte: number;
  readonly startLine: number;
  readonly startColumnByte: number;
  readonly endLine: number;
  readonly endColumnByte: number;
  readonly score: number | string;
}

function toIndex(row: ProjectEmbeddingIndexRunModel): ProjectEmbeddingIndex {
  const value = row.get();
  return ProjectEmbeddingIndexSchema.parse({
    ...value,
    startedAt: value.startedAt.toISOString(),
    completedAt: value.completedAt?.toISOString() ?? null,
  });
}
