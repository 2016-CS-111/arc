import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectSourceFileAttributes, ProjectSourceFileCreationAttributes } from "../database.types.js";

export class ProjectSourceFileModel extends Model<ProjectSourceFileAttributes, ProjectSourceFileCreationAttributes> {
  declare id: string;
  declare projectId: string;
  declare sourceIndexRunId: string;
  declare inventoryScanId: string;
  declare relativePath: string;
  declare status: ProjectSourceFileAttributes["status"];
  declare skipReason: ProjectSourceFileAttributes["skipReason"];
  declare contentHash: string | null;
  declare language: string | null;
  declare sizeBytes: number | string;
  declare modifiedAt: Date;
  declare indexedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectSourceFileModel> {
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
        inventoryScanId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "inventory_scan_id",
        },
        relativePath: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "relative_path",
          validate: {
            len: [1, 4_096],
          },
        },
        status: {
          type: DataTypes.ENUM("ready", "skipped"),
          allowNull: false,
        },
        skipReason: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "skip_reason",
        },
        contentHash: {
          type: DataTypes.CHAR(64),
          allowNull: true,
          field: "content_hash",
        },
        language: {
          type: DataTypes.STRING(64),
          allowNull: true,
        },
        sizeBytes: {
          type: DataTypes.BIGINT,
          allowNull: false,
          field: "size_bytes",
        },
        modifiedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          field: "modified_at",
        },
        indexedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "indexed_at",
        },
      },
      {
        sequelize,
        modelName: "projectSourceFiles",
        tableName: "project_source_files",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id", "relative_path"],
            name: "project_source_files_project_path_unique",
            unique: true,
          },
          {
            fields: ["source_index_run_id"],
            name: "project_source_files_run_idx",
          },
          {
            fields: ["project_id", "status"],
            name: "project_source_files_project_status_idx",
          },
        ],
      },
    );
  }
}
