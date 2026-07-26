import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ProjectAttributes, ProjectCreationAttributes } from "../database.types.js";

export class ProjectModel extends Model<ProjectAttributes, ProjectCreationAttributes> {
  declare id: string;
  declare name: string;
  declare rootPath: string;
  declare createdAt: Date;
  declare updatedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectModel> {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        rootPath: {
          type: DataTypes.TEXT,
          allowNull: false,
          unique: "projects_root_path_unique",
          field: "root_path",
          validate: {
            len: [1, 4_096],
          },
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          field: "created_at",
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          field: "updated_at",
        },
      },
      {
        sequelize,
        modelName: "projects",
        tableName: "projects",
        timestamps: true,
        underscored: true,
        indexes: [{ fields: ["updated_at", "id"], name: "projects_updated_at_idx" }],
      },
    );
  }
}
