import { DataTypes, Model, type ModelStatic, type Optional, type Sequelize } from "sequelize";

export interface ProjectFrameworkEntityModelAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly frameworkIndexRunId: string;
  readonly scopeId: string;
  readonly frameworkFileId: string;
  readonly sourceFileId: string;
  readonly identityKey: string;
  readonly framework: string;
  readonly entityKind: string;
  readonly name: string;
  readonly relativePath: string;
  readonly symbolId: string | null;
  readonly evidenceKind: string;
  readonly certainty: string;
  readonly range: object | null;
  readonly attributes: object;
}
export class ProjectFrameworkEntityModel extends Model<
  ProjectFrameworkEntityModelAttributes,
  Optional<ProjectFrameworkEntityModelAttributes, "id" | "symbolId" | "range">
> {
  declare id: string;
  declare projectId: string;
  declare frameworkIndexRunId: string;
  declare scopeId: string;
  declare frameworkFileId: string;
  declare sourceFileId: string;
  declare identityKey: string;
  declare framework: string;
  declare entityKind: string;
  declare name: string;
  declare relativePath: string;
  declare symbolId: string | null;
  declare evidenceKind: string;
  declare certainty: string;
  declare range: object | null;
  declare attributes: object;
  public static initialize(sequelize: Sequelize): ModelStatic<ProjectFrameworkEntityModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        frameworkIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "framework_index_run_id" },
        scopeId: { type: DataTypes.UUID, allowNull: false, field: "scope_id" },
        frameworkFileId: { type: DataTypes.UUID, allowNull: false, field: "framework_file_id" },
        sourceFileId: { type: DataTypes.UUID, allowNull: false, field: "source_file_id" },
        identityKey: { type: DataTypes.CHAR(64), allowNull: false, field: "identity_key" },
        framework: { type: DataTypes.STRING(32), allowNull: false },
        entityKind: { type: DataTypes.STRING(32), allowNull: false, field: "entity_kind" },
        name: { type: DataTypes.TEXT, allowNull: false },
        relativePath: { type: DataTypes.TEXT, allowNull: false, field: "relative_path" },
        symbolId: { type: DataTypes.UUID, allowNull: true, field: "symbol_id" },
        evidenceKind: { type: DataTypes.STRING(32), allowNull: false, field: "evidence_kind" },
        certainty: { type: DataTypes.STRING(32), allowNull: false },
        range: { type: DataTypes.JSONB, allowNull: true },
        attributes: { type: DataTypes.JSONB, allowNull: false },
      },
      {
        sequelize,
        modelName: "projectFrameworkEntities",
        tableName: "project_framework_entities",
        timestamps: false,
        indexes: [{ fields: ["project_id", "identity_key"], unique: true }],
      },
    );
  }
}
