import "pgvector/sequelize";

import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectEmbeddingChunkAttributes, ProjectEmbeddingChunkCreationAttributes } from "../database.types.js";

export class ProjectEmbeddingChunkModel extends Model<
  ProjectEmbeddingChunkAttributes,
  ProjectEmbeddingChunkCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare embeddingIndexRunId: string;
  declare embeddingFileId: string;
  declare sourceFileId: string;
  declare identityKey: string;
  declare relativePath: string;
  declare language: string;
  declare sourceContentHash: string;
  declare contentHash: string;
  declare inputHash: string;
  declare inputFormat: string;
  declare provider: "ollama";
  declare model: string;
  declare dimensions: number;
  declare ownerSymbolId: string | null;
  declare ownerSymbolIdentityKey: string | null;
  declare ownerSymbolKind: ProjectEmbeddingChunkAttributes["ownerSymbolKind"];
  declare ownerSymbolName: string | null;
  declare ownerSymbolQualifiedName: string | null;
  declare startByte: number;
  declare endByte: number;
  declare startLine: number;
  declare startColumnByte: number;
  declare endLine: number;
  declare endColumnByte: number;
  declare embedding: number[];

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectEmbeddingChunkModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        embeddingIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "embedding_index_run_id" },
        embeddingFileId: { type: DataTypes.UUID, allowNull: false, field: "embedding_file_id" },
        sourceFileId: { type: DataTypes.UUID, allowNull: false, field: "source_file_id" },
        identityKey: { type: DataTypes.CHAR(64), allowNull: false, field: "identity_key" },
        relativePath: { type: DataTypes.TEXT, allowNull: false, field: "relative_path" },
        language: { type: DataTypes.STRING(64), allowNull: false },
        sourceContentHash: { type: DataTypes.CHAR(64), allowNull: false, field: "source_content_hash" },
        contentHash: { type: DataTypes.CHAR(64), allowNull: false, field: "content_hash" },
        inputHash: { type: DataTypes.CHAR(64), allowNull: false, field: "input_hash" },
        inputFormat: { type: DataTypes.TEXT, allowNull: false, field: "input_format" },
        provider: { type: DataTypes.STRING(32), allowNull: false },
        model: { type: DataTypes.TEXT, allowNull: false },
        dimensions: { type: DataTypes.INTEGER, allowNull: false },
        ownerSymbolId: { type: DataTypes.UUID, allowNull: true, field: "owner_symbol_id" },
        ownerSymbolIdentityKey: {
          type: DataTypes.CHAR(64),
          allowNull: true,
          field: "owner_symbol_identity_key",
        },
        ownerSymbolKind: { type: DataTypes.STRING(32), allowNull: true, field: "owner_symbol_kind" },
        ownerSymbolName: { type: DataTypes.TEXT, allowNull: true, field: "owner_symbol_name" },
        ownerSymbolQualifiedName: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "owner_symbol_qualified_name",
        },
        startByte: { type: DataTypes.INTEGER, allowNull: false, field: "start_byte" },
        endByte: { type: DataTypes.INTEGER, allowNull: false, field: "end_byte" },
        startLine: { type: DataTypes.INTEGER, allowNull: false, field: "start_line" },
        startColumnByte: { type: DataTypes.INTEGER, allowNull: false, field: "start_column_byte" },
        endLine: { type: DataTypes.INTEGER, allowNull: false, field: "end_line" },
        endColumnByte: { type: DataTypes.INTEGER, allowNull: false, field: "end_column_byte" },
        embedding: { type: DataTypes.VECTOR(1_024), allowNull: false },
      },
      {
        sequelize,
        modelName: "projectEmbeddingChunks",
        tableName: "project_embedding_chunks",
        timestamps: false,
        indexes: [
          { fields: ["project_id", "identity_key"], unique: true },
          { fields: ["project_id", "embedding_index_run_id", "relative_path", "start_byte", "id"] },
          { fields: ["embedding"], using: "hnsw", operator: "vector_cosine_ops" },
        ],
      },
    );
  }
}
