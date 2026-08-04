import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectDependencyFileAttributes, ProjectDependencyFileCreationAttributes } from "../database.types.js";

export class ProjectDependencyFileModel extends Model<
  ProjectDependencyFileAttributes,
  ProjectDependencyFileCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare dependencyIndexRunId: string;
  declare sourceFileId: string;
  declare relativePath: string;
  declare sourceContentHash: string;
  declare language: string;
  declare extractorIdentity: string;
  declare status: ProjectDependencyFileAttributes["status"];
  declare hasSyntaxErrors: boolean;
  declare edgeCount: number;
  declare bindingCount: number;
  declare omittedEdgeCount: number;
  declare omittedBindingCount: number;
  declare errorCode: ProjectDependencyFileAttributes["errorCode"];
  declare extractedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectDependencyFileModel> {
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
        dependencyIndexRunId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "dependency_index_run_id",
        },
        sourceFileId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "source_file_id",
        },
        relativePath: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "relative_path",
          validate: { len: [1, 4_096] },
        },
        sourceContentHash: {
          type: DataTypes.CHAR(64),
          allowNull: false,
          field: "source_content_hash",
        },
        language: {
          type: DataTypes.STRING(64),
          allowNull: false,
        },
        extractorIdentity: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "extractor_identity",
        },
        status: {
          type: DataTypes.ENUM("extracted", "extracted_with_errors", "unsupported", "failed", "limited"),
          allowNull: false,
        },
        hasSyntaxErrors: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "has_syntax_errors",
        },
        edgeCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "edge_count",
        },
        bindingCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "binding_count",
        },
        omittedEdgeCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "omitted_edge_count",
        },
        omittedBindingCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "omitted_binding_count",
        },
        errorCode: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "error_code",
        },
        extractedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "extracted_at",
        },
      },
      {
        sequelize,
        modelName: "projectDependencyFiles",
        tableName: "project_dependency_files",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id", "source_file_id"],
            name: "project_dependency_files_project_source_unique",
            unique: true,
          },
          {
            fields: ["dependency_index_run_id"],
            name: "project_dependency_files_run_idx",
          },
          {
            fields: ["project_id", "relative_path"],
            name: "project_dependency_files_project_path_idx",
          },
        ],
      },
    );
  }
}
