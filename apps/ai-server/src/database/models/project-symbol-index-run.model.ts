import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectSymbolIndexRunAttributes, ProjectSymbolIndexRunCreationAttributes } from "../database.types.js";

export class ProjectSymbolIndexRunModel extends Model<
  ProjectSymbolIndexRunAttributes,
  ProjectSymbolIndexRunCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare sourceIndexRunId: string;
  declare status: ProjectSymbolIndexRunAttributes["status"];
  declare parsedFileCount: number;
  declare reusedFileCount: number;
  declare unsupportedFileCount: number;
  declare failedFileCount: number;
  declare symbolCount: number;
  declare omittedSymbolCount: number;
  declare limitReasons: ProjectSymbolIndexRunAttributes["limitReasons"];
  declare errorCode: ProjectSymbolIndexRunAttributes["errorCode"];
  declare startedAt: Date;
  declare completedAt: Date | null;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectSymbolIndexRunModel> {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "project_id",
        },
        sourceIndexRunId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "source_index_run_id",
        },
        status: {
          type: DataTypes.ENUM("running", "completed", "limited", "failed"),
          allowNull: false,
          defaultValue: "running",
        },
        parsedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "parsed_file_count",
        },
        reusedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "reused_file_count",
        },
        unsupportedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "unsupported_file_count",
        },
        failedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "failed_file_count",
        },
        symbolCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "symbol_count",
        },
        omittedSymbolCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "omitted_symbol_count",
        },
        limitReasons: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: [],
          field: "limit_reasons",
        },
        errorCode: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "error_code",
        },
        startedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "started_at",
        },
        completedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "completed_at",
        },
      },
      {
        sequelize,
        modelName: "projectSymbolIndexRuns",
        tableName: "project_symbol_index_runs",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id"],
            name: "project_symbol_index_runs_one_running_idx",
            unique: true,
            where: { status: "running" },
          },
          {
            fields: ["project_id", "started_at", "id"],
            name: "project_symbol_index_runs_project_started_idx",
          },
        ],
      },
    );
  }
}
