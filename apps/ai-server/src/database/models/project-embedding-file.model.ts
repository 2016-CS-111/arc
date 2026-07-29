import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectEmbeddingFileAttributes, ProjectEmbeddingFileCreationAttributes } from "../database.types.js";

export class ProjectEmbeddingFileModel extends Model<
  ProjectEmbeddingFileAttributes,
  ProjectEmbeddingFileCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare embeddingIndexRunId: string;
  declare sourceFileId: string;
  declare relativePath: string;
  declare sourceContentHash: string;
  declare language: string;
  declare status: "indexed" | "limited";
  declare chunkCount: number;
  declare indexedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectEmbeddingFileModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        embeddingIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "embedding_index_run_id" },
        sourceFileId: { type: DataTypes.UUID, allowNull: false, field: "source_file_id" },
        relativePath: { type: DataTypes.TEXT, allowNull: false, field: "relative_path" },
        sourceContentHash: { type: DataTypes.CHAR(64), allowNull: false, field: "source_content_hash" },
        language: { type: DataTypes.STRING(64), allowNull: false },
        status: { type: DataTypes.ENUM("indexed", "limited"), allowNull: false },
        chunkCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "chunk_count" },
        indexedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "indexed_at" },
      },
      {
        sequelize,
        modelName: "projectEmbeddingFiles",
        tableName: "project_embedding_files",
        timestamps: false,
        indexes: [{ fields: ["project_id", "source_file_id"], unique: true }],
      },
    );
  }
}
