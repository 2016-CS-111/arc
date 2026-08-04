import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectFileAttributes, ProjectFileCreationAttributes } from "../database.types.js";

export class ProjectFileModel extends Model<ProjectFileAttributes, ProjectFileCreationAttributes> {
  declare id: string;
  declare projectId: string;
  declare scanId: string;
  declare relativePath: string;
  declare sizeBytes: number | string;
  declare modifiedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectFileModel> {
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
        scanId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "scan_id",
        },
        relativePath: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "relative_path",
          validate: {
            len: [1, 4_096],
          },
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
      },
      {
        sequelize,
        modelName: "projectFiles",
        tableName: "project_files",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id", "relative_path"],
            name: "project_files_project_path_unique",
            unique: true,
          },
          {
            fields: ["scan_id"],
            name: "project_files_scan_idx",
          },
        ],
      },
    );
  }
}
