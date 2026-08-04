import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectSourceIndexRunAttributes, ProjectSourceIndexRunCreationAttributes } from "../database.types.js";

export class ProjectSourceIndexRunModel extends Model<
  ProjectSourceIndexRunAttributes,
  ProjectSourceIndexRunCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare inventoryScanId: string;
  declare status: ProjectSourceIndexRunAttributes["status"];
  declare readyFileCount: number;
  declare skippedFileCount: number;
  declare inspectedBytes: number | string;
  declare readyBytes: number | string;
  declare limitReasons: ProjectSourceIndexRunAttributes["limitReasons"];
  declare errorCode: ProjectSourceIndexRunAttributes["errorCode"];
  declare startedAt: Date;
  declare completedAt: Date | null;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectSourceIndexRunModel> {
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
        inventoryScanId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "inventory_scan_id",
        },
        status: {
          type: DataTypes.ENUM("running", "completed", "limited", "failed"),
          allowNull: false,
          defaultValue: "running",
        },
        readyFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "ready_file_count",
        },
        skippedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "skipped_file_count",
        },
        inspectedBytes: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
          field: "inspected_bytes",
        },
        readyBytes: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
          field: "ready_bytes",
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
        modelName: "projectSourceIndexRuns",
        tableName: "project_source_index_runs",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id"],
            name: "project_source_index_runs_one_running_idx",
            unique: true,
            where: { status: "running" },
          },
          {
            fields: ["project_id", "started_at", "id"],
            name: "project_source_index_runs_project_started_idx",
          },
        ],
      },
    );
  }
}
