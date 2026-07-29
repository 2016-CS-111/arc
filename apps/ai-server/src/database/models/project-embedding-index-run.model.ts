import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type {
  ProjectEmbeddingIndexRunAttributes,
  ProjectEmbeddingIndexRunCreationAttributes,
} from "../database.types.js";

export class ProjectEmbeddingIndexRunModel extends Model<
  ProjectEmbeddingIndexRunAttributes,
  ProjectEmbeddingIndexRunCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare sourceIndexRunId: string;
  declare symbolIndexRunId: string;
  declare dependencyIndexRunId: string;
  declare frameworkIndexRunId: string;
  declare status: ProjectEmbeddingIndexRunAttributes["status"];
  declare provider: "ollama";
  declare model: string;
  declare dimensions: number;
  declare inputFormat: string;
  declare chunkerIdentity: string;
  declare fileCount: number;
  declare chunkCount: number;
  declare embeddedChunkCount: number;
  declare reusedChunkCount: number;
  declare limitReasons: ProjectEmbeddingIndexRunAttributes["limitReasons"];
  declare errorCode: ProjectEmbeddingIndexRunAttributes["errorCode"];
  declare startedAt: Date;
  declare completedAt: Date | null;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectEmbeddingIndexRunModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        sourceIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "source_index_run_id" },
        symbolIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "symbol_index_run_id" },
        dependencyIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "dependency_index_run_id" },
        frameworkIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "framework_index_run_id" },
        status: {
          type: DataTypes.ENUM("running", "completed", "limited", "failed"),
          allowNull: false,
          defaultValue: "running",
        },
        provider: { type: DataTypes.STRING(32), allowNull: false },
        model: { type: DataTypes.TEXT, allowNull: false },
        dimensions: { type: DataTypes.INTEGER, allowNull: false },
        inputFormat: { type: DataTypes.TEXT, allowNull: false, field: "input_format" },
        chunkerIdentity: { type: DataTypes.TEXT, allowNull: false, field: "chunker_identity" },
        fileCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "file_count" },
        chunkCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "chunk_count" },
        embeddedChunkCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "embedded_chunk_count",
        },
        reusedChunkCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "reused_chunk_count",
        },
        limitReasons: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: [],
          field: "limit_reasons",
        },
        errorCode: { type: DataTypes.STRING(64), allowNull: true, field: "error_code" },
        startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "started_at" },
        completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" },
      },
      {
        sequelize,
        modelName: "projectEmbeddingIndexRuns",
        tableName: "project_embedding_index_runs",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id"],
            name: "project_embedding_runs_one_running_idx",
            unique: true,
            where: { status: "running" },
          },
        ],
      },
    );
  }
}
