import { DataTypes, Model, type ModelStatic, type Optional, type Sequelize } from "sequelize";
import type { ProjectFrameworkScopeEvidence } from "../../modules/projects/domain/project-framework.types.js";

export interface ProjectFrameworkScopeModelAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly frameworkIndexRunId: string;
  readonly scopeKey: string;
  readonly framework: string;
  readonly rootPath: string;
  readonly packageName: string | null;
  readonly contextHash: string;
  readonly evidence: readonly ProjectFrameworkScopeEvidence[];
}

export class ProjectFrameworkScopeModel extends Model<
  ProjectFrameworkScopeModelAttributes,
  Optional<ProjectFrameworkScopeModelAttributes, "id" | "packageName">
> {
  declare id: string;
  declare projectId: string;
  declare frameworkIndexRunId: string;
  declare scopeKey: string;
  declare framework: string;
  declare rootPath: string;
  declare packageName: string | null;
  declare contextHash: string;
  declare evidence: readonly ProjectFrameworkScopeEvidence[];

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectFrameworkScopeModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        frameworkIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "framework_index_run_id" },
        scopeKey: { type: DataTypes.CHAR(64), allowNull: false, field: "scope_key" },
        framework: { type: DataTypes.STRING(32), allowNull: false },
        rootPath: { type: DataTypes.TEXT, allowNull: false, field: "root_path" },
        packageName: { type: DataTypes.TEXT, allowNull: true, field: "package_name" },
        contextHash: { type: DataTypes.CHAR(64), allowNull: false, field: "context_hash" },
        evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      },
      {
        sequelize,
        modelName: "projectFrameworkScopes",
        tableName: "project_framework_scopes",
        timestamps: false,
        indexes: [{ fields: ["project_id", "scope_key"], unique: true }],
      },
    );
  }
}
