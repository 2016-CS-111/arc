import { DataTypes, Model, type ModelStatic, type Optional, type Sequelize } from "sequelize";

export interface ProjectFrameworkRelationshipModelAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly frameworkIndexRunId: string;
  readonly scopeId: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string | null;
  readonly sourceFileId: string | null;
  readonly dependencyEdgeId: string | null;
  readonly symbolId: string | null;
  readonly identityKey: string;
  readonly framework: string;
  readonly relationshipKind: string;
  readonly targetName: string | null;
  readonly evidenceKind: string;
  readonly certainty: string;
  readonly range: object | null;
  readonly attributes: object;
}

export class ProjectFrameworkRelationshipModel extends Model<
  ProjectFrameworkRelationshipModelAttributes,
  Optional<
    ProjectFrameworkRelationshipModelAttributes,
    "id" | "targetEntityId" | "sourceFileId" | "dependencyEdgeId" | "symbolId" | "targetName" | "range"
  >
> {
  declare id: string;
  declare projectId: string;
  declare frameworkIndexRunId: string;
  declare scopeId: string;
  declare sourceEntityId: string;
  declare targetEntityId: string | null;
  declare sourceFileId: string | null;
  declare dependencyEdgeId: string | null;
  declare symbolId: string | null;
  declare identityKey: string;
  declare framework: string;
  declare relationshipKind: string;
  declare targetName: string | null;
  declare evidenceKind: string;
  declare certainty: string;
  declare range: object | null;
  declare attributes: object;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectFrameworkRelationshipModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        frameworkIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "framework_index_run_id" },
        scopeId: { type: DataTypes.UUID, allowNull: false, field: "scope_id" },
        sourceEntityId: { type: DataTypes.UUID, allowNull: false, field: "source_entity_id" },
        targetEntityId: { type: DataTypes.UUID, allowNull: true, field: "target_entity_id" },
        sourceFileId: { type: DataTypes.UUID, allowNull: true, field: "source_file_id" },
        dependencyEdgeId: { type: DataTypes.UUID, allowNull: true, field: "dependency_edge_id" },
        symbolId: { type: DataTypes.UUID, allowNull: true, field: "symbol_id" },
        identityKey: { type: DataTypes.CHAR(64), allowNull: false, field: "identity_key" },
        framework: { type: DataTypes.STRING(32), allowNull: false },
        relationshipKind: { type: DataTypes.STRING(32), allowNull: false, field: "relationship_kind" },
        targetName: { type: DataTypes.TEXT, allowNull: true, field: "target_name" },
        evidenceKind: { type: DataTypes.STRING(32), allowNull: false, field: "evidence_kind" },
        certainty: { type: DataTypes.STRING(32), allowNull: false },
        range: { type: DataTypes.JSONB, allowNull: true },
        attributes: { type: DataTypes.JSONB, allowNull: false },
      },
      {
        sequelize,
        modelName: "projectFrameworkRelationships",
        tableName: "project_framework_relationships",
        timestamps: false,
        indexes: [{ fields: ["project_id", "identity_key"], unique: true }],
      },
    );
  }
}
