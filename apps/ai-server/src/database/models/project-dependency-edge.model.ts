import { DataTypes, Model, Op, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectDependencyEdgeAttributes, ProjectDependencyEdgeCreationAttributes } from "../database.types.js";

export class ProjectDependencyEdgeModel extends Model<
  ProjectDependencyEdgeAttributes,
  ProjectDependencyEdgeCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare dependencyIndexRunId: string;
  declare dependencyFileId: string;
  declare sourceFileId: string;
  declare extractionKey: string;
  declare kind: ProjectDependencyEdgeAttributes["kind"];
  declare specifier: string;
  declare typeOnly: boolean;
  declare resolutionKind: ProjectDependencyEdgeAttributes["resolutionKind"];
  declare targetSourceFileId: string | null;
  declare targetRelativePath: string | null;
  declare externalPackage: string | null;
  declare unresolvedReason: ProjectDependencyEdgeAttributes["unresolvedReason"];
  declare startByte: number;
  declare endByte: number;
  declare startLine: number;
  declare startColumnByte: number;
  declare endLine: number;
  declare endColumnByte: number;
  declare specifierStartByte: number;
  declare specifierEndByte: number;
  declare specifierStartLine: number;
  declare specifierStartColumnByte: number;
  declare specifierEndLine: number;
  declare specifierEndColumnByte: number;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectDependencyEdgeModel> {
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
        dependencyFileId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "dependency_file_id",
        },
        sourceFileId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "source_file_id",
        },
        extractionKey: {
          type: DataTypes.CHAR(64),
          allowNull: false,
          field: "extraction_key",
        },
        kind: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        specifier: {
          type: DataTypes.TEXT,
          allowNull: false,
          validate: { len: [1, 1_024] },
        },
        typeOnly: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "type_only",
        },
        resolutionKind: {
          type: DataTypes.ENUM("local", "external", "builtin", "unresolved"),
          allowNull: false,
          field: "resolution_kind",
        },
        targetSourceFileId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "target_source_file_id",
        },
        targetRelativePath: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "target_relative_path",
        },
        externalPackage: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "external_package",
        },
        unresolvedReason: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "unresolved_reason",
        },
        startByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "start_byte",
        },
        endByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "end_byte",
        },
        startLine: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "start_line",
        },
        startColumnByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "start_column_byte",
        },
        endLine: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "end_line",
        },
        endColumnByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "end_column_byte",
        },
        specifierStartByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "specifier_start_byte",
        },
        specifierEndByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "specifier_end_byte",
        },
        specifierStartLine: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "specifier_start_line",
        },
        specifierStartColumnByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "specifier_start_column_byte",
        },
        specifierEndLine: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "specifier_end_line",
        },
        specifierEndColumnByte: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "specifier_end_column_byte",
        },
      },
      {
        sequelize,
        modelName: "projectDependencyEdges",
        tableName: "project_dependency_edges",
        timestamps: false,
        indexes: [
          {
            fields: ["dependency_file_id", "extraction_key"],
            name: "project_dependency_edges_file_key_unique",
            unique: true,
          },
          {
            fields: ["dependency_index_run_id"],
            name: "project_dependency_edges_run_idx",
          },
          {
            fields: ["project_id", "source_file_id"],
            name: "project_dependency_edges_source_idx",
          },
          {
            fields: ["project_id", "target_source_file_id"],
            name: "project_dependency_edges_target_idx",
            where: { target_source_file_id: { [Op.ne]: null } },
          },
          {
            fields: ["project_id", "resolution_kind"],
            name: "project_dependency_edges_resolution_idx",
          },
        ],
      },
    );
  }
}
