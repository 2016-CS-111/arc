import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectSymbolFileAttributes, ProjectSymbolFileCreationAttributes } from "../database.types.js";

export class ProjectSymbolFileModel extends Model<ProjectSymbolFileAttributes, ProjectSymbolFileCreationAttributes> {
  declare id: string;
  declare projectId: string;
  declare symbolIndexRunId: string;
  declare sourceFileId: string;
  declare relativePath: string;
  declare sourceContentHash: string;
  declare language: string;
  declare parserIdentity: string;
  declare status: ProjectSymbolFileAttributes["status"];
  declare hasSyntaxErrors: boolean;
  declare symbolCount: number;
  declare omittedSymbolCount: number;
  declare errorCode: ProjectSymbolFileAttributes["errorCode"];
  declare parsedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectSymbolFileModel> {
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
        parserIdentity: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "parser_identity",
        },
        status: {
          type: DataTypes.ENUM("parsed", "parsed_with_errors", "unsupported", "failed", "limited"),
          allowNull: false,
        },
        hasSyntaxErrors: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "has_syntax_errors",
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
        errorCode: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "error_code",
        },
        parsedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "parsed_at",
        },
      },
      {
        sequelize,
        modelName: "projectSymbolFiles",
        tableName: "project_symbol_files",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id", "source_file_id"],
            name: "project_symbol_files_project_source_unique",
            unique: true,
          },
          {
            fields: ["symbol_index_run_id"],
            name: "project_symbol_files_run_idx",
          },
          {
            fields: ["project_id", "relative_path"],
            name: "project_symbol_files_project_path_idx",
          },
        ],
      },
    );
  }
}
