import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";
import type {
  ProjectFrameworkIndexRunAttributes,
  ProjectFrameworkIndexRunCreationAttributes,
} from "../database.types.js";
export class ProjectFrameworkIndexRunModel extends Model<
  ProjectFrameworkIndexRunAttributes,
  ProjectFrameworkIndexRunCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare sourceIndexRunId: string;
  declare symbolIndexRunId: string;
  declare dependencyIndexRunId: string;
  declare status: ProjectFrameworkIndexRunAttributes["status"];
  declare analyzerSetIdentity: string;
  declare scopeCount: number;
  declare analyzedFileCount: number;
  declare reusedFileCount: number;
  declare unsupportedFileCount: number;
  declare failedFileCount: number;
  declare entityCount: number;
  declare relationshipCount: number;
  declare unresolvedRelationshipCount: number;
  declare omissionCount: number;
  declare limitReasons: string[];
  declare warnings: string[];
  declare errorCode: string | null;
  declare startedAt: Date;
  declare completedAt: Date | null;
  public static initialize(sequelize: Sequelize): ModelStatic<ProjectFrameworkIndexRunModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        sourceIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "source_index_run_id" },
        symbolIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "symbol_index_run_id" },
        dependencyIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "dependency_index_run_id" },
        status: {
          type: DataTypes.ENUM("running", "completed", "limited", "failed"),
          allowNull: false,
          defaultValue: "running",
        },
        analyzerSetIdentity: { type: DataTypes.CHAR(64), allowNull: false, field: "analyzer_set_identity" },
        scopeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "scope_count" },
        analyzedFileCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "analyzed_file_count" },
        reusedFileCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "reused_file_count" },
        unsupportedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "unsupported_file_count",
        },
        failedFileCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "failed_file_count" },
        entityCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "entity_count" },
        relationshipCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "relationship_count" },
        unresolvedRelationshipCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "unresolved_relationship_count",
        },
        omissionCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "omission_count" },
        limitReasons: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: [],
          field: "limit_reasons",
        },
        warnings: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
        errorCode: { type: DataTypes.STRING(64), allowNull: true, field: "error_code" },
        startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "started_at" },
        completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" },
      },
      {
        sequelize,
        modelName: "projectFrameworkIndexRuns",
        tableName: "project_framework_index_runs",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id"],
            name: "project_framework_runs_one_running_idx",
            unique: true,
            where: { status: "running" },
          },
        ],
      },
    );
  }
}
