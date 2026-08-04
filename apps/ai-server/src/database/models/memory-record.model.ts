import "pgvector/sequelize";

import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { MemoryRecordAttributes, MemoryRecordCreationAttributes } from "../database.types.js";

export class MemoryRecordModel extends Model<MemoryRecordAttributes, MemoryRecordCreationAttributes> {
  declare id: string;
  declare scope: MemoryRecordAttributes["scope"];
  declare projectId: string | null;
  declare kind: MemoryRecordAttributes["kind"];
  declare content: string;
  declare contentHash: string;
  declare provenance: MemoryRecordAttributes["provenance"];
  declare confidence: number;
  declare pinned: boolean;
  declare expiresAt: Date | null;
  declare usedAt: Date | null;
  declare embedding: number[] | null;
  declare embeddingModel: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<MemoryRecordModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        scope: { type: DataTypes.STRING(16), allowNull: false },
        projectId: { type: DataTypes.UUID, allowNull: true, field: "project_id" },
        kind: { type: DataTypes.STRING(32), allowNull: false },
        content: { type: DataTypes.TEXT, allowNull: false },
        contentHash: { type: DataTypes.CHAR(64), allowNull: false, field: "content_hash" },
        provenance: { type: DataTypes.STRING(16), allowNull: false },
        confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
        pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        expiresAt: { type: DataTypes.DATE, allowNull: true, field: "expires_at" },
        usedAt: { type: DataTypes.DATE, allowNull: true, field: "used_at" },
        embedding: { type: DataTypes.VECTOR(1_024), allowNull: true },
        embeddingModel: { type: DataTypes.TEXT, allowNull: true, field: "embedding_model" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
        updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
      },
      {
        sequelize,
        modelName: "memoryRecords",
        tableName: "memory_records",
        timestamps: true,
        underscored: true,
        indexes: [
          { fields: ["scope", "project_id", "pinned", "updated_at", "id"] },
          { fields: ["scope", "project_id", "kind", "content_hash"] },
          { fields: ["embedding"], using: "hnsw", operator: "vector_cosine_ops" },
        ],
      },
    );
  }
}
