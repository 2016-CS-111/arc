import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectScanAttributes, ProjectScanCreationAttributes } from "../database.types.js";

export class ProjectScanModel extends Model<ProjectScanAttributes, ProjectScanCreationAttributes> {
  declare id: string;
  declare projectId: string;
  declare status: ProjectScanAttributes["status"];
  declare fileCount: number;
  declare totalBytes: number | string;
  declare ignoredPathCount: number;
  declare skippedSymlinkCount: number;
  declare limitReasons: ProjectScanAttributes["limitReasons"];
  declare errorCode: ProjectScanAttributes["errorCode"];
  declare startedAt: Date;
  declare completedAt: Date | null;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectScanModel> {
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
        status: {
          type: DataTypes.ENUM("running", "completed", "limited", "failed"),
          allowNull: false,
          defaultValue: "running",
        },
        fileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "file_count",
        },
        totalBytes: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
          field: "total_bytes",
        },
        ignoredPathCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "ignored_path_count",
        },
        skippedSymlinkCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "skipped_symlink_count",
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
        modelName: "projectScans",
        tableName: "project_scans",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id"],
            name: "project_scans_one_running_idx",
            unique: true,
            where: { status: "running" },
          },
          {
            fields: ["project_id", "started_at", "id"],
            name: "project_scans_project_started_idx",
          },
        ],
      },
    );
  }
}
