import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectSymbolAttributes, ProjectSymbolCreationAttributes } from "../database.types.js";

export class ProjectSymbolModel extends Model<ProjectSymbolAttributes, ProjectSymbolCreationAttributes> {
  declare id: string;
  declare projectId: string;
  declare symbolIndexRunId: string;
  declare symbolFileId: string;
  declare sourceFileId: string;
  declare identityKey: string;
  declare parentIdentityKey: string | null;
  declare kind: ProjectSymbolAttributes["kind"];
  declare name: string;
  declare qualifiedName: string;
  declare exported: boolean;
  declare startByte: number;
  declare endByte: number;
  declare startLine: number;
  declare startColumnByte: number;
  declare endLine: number;
  declare endColumnByte: number;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectSymbolModel> {
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
        symbolIndexRunId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "symbol_index_run_id",
        },
        symbolFileId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "symbol_file_id",
        },
        sourceFileId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "source_file_id",
        },
        identityKey: {
          type: DataTypes.CHAR(64),
          allowNull: false,
          field: "identity_key",
        },
        parentIdentityKey: {
          type: DataTypes.CHAR(64),
          allowNull: true,
          field: "parent_identity_key",
        },
        kind: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        name: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        qualifiedName: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "qualified_name",
        },
        exported: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
      },
      {
        sequelize,
        modelName: "projectSymbols",
        tableName: "project_symbols",
        timestamps: false,
        indexes: [
          {
            fields: ["symbol_file_id", "identity_key"],
            name: "project_symbols_file_identity_unique",
            unique: true,
          },
          {
            fields: ["symbol_index_run_id"],
            name: "project_symbols_run_idx",
          },
          {
            fields: ["project_id", "name"],
            name: "project_symbols_project_name_idx",
          },
          {
            fields: ["project_id", "kind"],
            name: "project_symbols_project_kind_idx",
          },
          {
            fields: ["source_file_id"],
            name: "project_symbols_source_file_idx",
          },
        ],
      },
    );
  }
}
