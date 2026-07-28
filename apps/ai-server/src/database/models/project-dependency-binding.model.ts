import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type {
  ProjectDependencyBindingAttributes,
  ProjectDependencyBindingCreationAttributes,
} from "../database.types.js";

export class ProjectDependencyBindingModel extends Model<
  ProjectDependencyBindingAttributes,
  ProjectDependencyBindingCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare dependencyIndexRunId: string;
  declare dependencyEdgeId: string;
  declare sourceFileId: string;
  declare bindingKey: string;
  declare kind: ProjectDependencyBindingAttributes["kind"];
  declare importedName: string | null;
  declare localName: string | null;
  declare exportedName: string | null;
  declare typeOnly: boolean;
  declare startByte: number | null;
  declare endByte: number | null;
  declare startLine: number | null;
  declare startColumnByte: number | null;
  declare endLine: number | null;
  declare endColumnByte: number | null;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectDependencyBindingModel> {
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
        dependencyEdgeId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "dependency_edge_id",
        },
        sourceFileId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "source_file_id",
        },
        bindingKey: {
          type: DataTypes.CHAR(64),
          allowNull: false,
          field: "binding_key",
        },
        kind: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        importedName: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "imported_name",
        },
        localName: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "local_name",
        },
        exportedName: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "exported_name",
        },
        typeOnly: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "type_only",
        },
        startByte: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "start_byte",
        },
        endByte: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "end_byte",
        },
        startLine: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "start_line",
        },
        startColumnByte: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "start_column_byte",
        },
        endLine: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "end_line",
        },
        endColumnByte: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "end_column_byte",
        },
      },
      {
        sequelize,
        modelName: "projectDependencyBindings",
        tableName: "project_dependency_bindings",
        timestamps: false,
        indexes: [
          {
            fields: ["dependency_edge_id", "binding_key"],
            name: "project_dependency_bindings_edge_key_unique",
            unique: true,
          },
          {
            fields: ["dependency_index_run_id"],
            name: "project_dependency_bindings_run_idx",
          },
          {
            fields: ["project_id", "source_file_id"],
            name: "project_dependency_bindings_source_idx",
          },
        ],
      },
    );
  }
}
