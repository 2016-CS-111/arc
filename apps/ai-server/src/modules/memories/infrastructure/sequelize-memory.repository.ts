import type { MemoryRecord, MemoryScope } from "@arc/contracts";
import pgvector from "pgvector";
import { Op, QueryTypes } from "sequelize";

import type { ArcDatabase } from "../../../database/database.types.js";
import type { MemoryRecordModel } from "../../../database/models/memory-record.model.js";
import type {
  CreateMemoryRecordInput,
  MemoryListInput,
  MemoryRepository,
  MemorySearchInput,
  SemanticMemorySearchInput,
  UpdateMemoryRecordInput,
} from "../application/memory.repository.js";

interface MemorySearchRow {
  readonly id: string;
}

export class SequelizeMemoryRepository implements MemoryRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async create(input: CreateMemoryRecordInput): Promise<MemoryRecord> {
    return toMemoryRecord(
      await this.database.models.memoryRecords.create({
        ...input,
        embedding: input.embedding === null ? null : [...input.embedding],
      }),
    );
  }

  public async delete(memoryId: string): Promise<boolean> {
    return (await this.database.models.memoryRecords.destroy({ where: { id: memoryId } })) > 0;
  }

  public async findByContentHash(input: {
    readonly contentHash: string;
    readonly kind: MemoryRecord["kind"];
    readonly projectId: string | null;
    readonly scope: MemoryScope;
  }): Promise<MemoryRecord | null> {
    const row = await this.database.models.memoryRecords.findOne({
      where: {
        contentHash: input.contentHash,
        kind: input.kind,
        projectId: input.projectId,
        scope: input.scope,
      },
    });
    return row === null ? null : toMemoryRecord(row);
  }

  public async findById(memoryId: string): Promise<MemoryRecord | null> {
    const row = await this.database.models.memoryRecords.findByPk(memoryId);
    return row === null ? null : toMemoryRecord(row);
  }

  public async list(input: MemoryListInput): Promise<readonly MemoryRecord[]> {
    const rows = await this.database.models.memoryRecords.findAll({
      limit: input.limit,
      order: [
        ["pinned", "DESC"],
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: this.scopeWhere(input),
    });
    return rows.map(toMemoryRecord);
  }

  public async searchText(input: MemorySearchInput): Promise<readonly MemoryRecord[]> {
    const ids = await this.searchIds(
      input,
      `to_tsvector('simple'::regconfig, m.content) @@ plainto_tsquery('simple'::regconfig, $1)
       ORDER BY ts_rank_cd(to_tsvector('simple'::regconfig, m.content), plainto_tsquery('simple'::regconfig, $1)) DESC,
                m.pinned DESC, m.updated_at DESC, m.id DESC`,
      [input.query],
    );
    return this.findInOrder(ids);
  }

  public async searchSemantic(input: SemanticMemorySearchInput): Promise<readonly MemoryRecord[]> {
    const ids = await this.searchIds(
      input,
      `m.embedding IS NOT NULL
       ORDER BY m.embedding <=> $1::vector ASC, m.pinned DESC, m.updated_at DESC, m.id DESC`,
      [pgvector.toSql([...input.embedding])],
    );
    return this.findInOrder(ids);
  }

  public async touch(memoryIds: readonly string[]): Promise<void> {
    if (memoryIds.length === 0) {
      return;
    }
    await this.database.models.memoryRecords.update({ usedAt: new Date() }, { where: { id: { [Op.in]: memoryIds } } });
  }

  public async update(memoryId: string, input: UpdateMemoryRecordInput): Promise<MemoryRecord | null> {
    const row = await this.database.models.memoryRecords.findByPk(memoryId);
    if (row === null) {
      return null;
    }
    const { embedding, ...updates } = input;
    row.set({
      ...updates,
      ...(embedding === undefined ? {} : { embedding: embedding === null ? null : [...embedding] }),
    });
    await row.save();
    return toMemoryRecord(row);
  }

  private async searchIds(
    input: MemoryListInput,
    conditionAndOrder: string,
    bind: readonly unknown[],
  ): Promise<readonly string[]> {
    const scope = scopeSql(input.projectId, bind.length + 1);
    const rows = await this.database.sequelize.query<MemorySearchRow>(
      `SELECT m.id
       FROM memory_records m
       WHERE (${scope.condition})
         AND ($${String(scope.nextPosition)}::boolean = TRUE OR m.pinned = TRUE OR m.expires_at IS NULL OR m.expires_at > NOW())
         AND ${conditionAndOrder}
       LIMIT $${String(scope.nextPosition + 1)}`,
      {
        bind: [...bind, ...scope.bind, input.includeExpired, input.limit],
        type: QueryTypes.SELECT,
      },
    );
    return rows.map((row) => row.id);
  }

  private async findInOrder(ids: readonly string[]): Promise<readonly MemoryRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.database.models.memoryRecords.findAll({ where: { id: { [Op.in]: ids } } });
    const byId = new Map(rows.map((row) => [row.id, toMemoryRecord(row)]));
    return ids.flatMap((id) => {
      const record = byId.get(id);
      return record === undefined ? [] : [record];
    });
  }

  private scopeWhere(input: MemoryListInput) {
    return {
      [Op.and]: [
        {
          [Op.or]:
            input.projectId === undefined ? [{ scope: "user" }] : [{ scope: "user" }, { projectId: input.projectId }],
        },
        ...(input.includeExpired
          ? []
          : [{ [Op.or]: [{ pinned: true }, { expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }] }]),
      ],
    };
  }
}

function scopeSql(
  projectId: string | undefined,
  position: number,
): { readonly bind: readonly unknown[]; readonly condition: string; readonly nextPosition: number } {
  if (projectId === undefined) {
    return { bind: [], condition: "m.scope = 'user'", nextPosition: position };
  }
  return {
    bind: [projectId],
    condition: `m.scope = 'user' OR m.project_id = $${String(position)}`,
    nextPosition: position + 1,
  };
}

function toMemoryRecord(row: MemoryRecordModel): MemoryRecord {
  return {
    confidence: row.confidence,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    id: row.id,
    kind: row.kind,
    pinned: row.pinned,
    projectId: row.projectId,
    provenance: row.provenance,
    scope: row.scope,
    updatedAt: row.updatedAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
  };
}
