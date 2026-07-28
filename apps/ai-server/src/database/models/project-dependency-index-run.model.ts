import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type {
  ProjectDependencyIndexRunAttributes,
  ProjectDependencyIndexRunCreationAttributes,
} from "../database.types.js";

export class ProjectDependencyIndexRunModel extends Model<
  ProjectDependencyIndexRunAttributes,
  ProjectDependencyIndexRunCreationAttributes
> {
  declare id: string;
  declare projectId: string;
  declare sourceIndexRunId: string;
  declare status: ProjectDependencyIndexRunAttributes["status"];
  declare resolutionContextHash: string | null;
  declare parsedFileCount: number;
  declare reusedFileCount: number;
  declare unsupportedFileCount: number;
  declare failedFileCount: number;
  declare edgeCount: number;
  declare bindingCount: number;
  declare omittedEdgeCount: number;
  declare omittedBindingCount: number;
  declare localEdgeCount: number;
  declare externalEdgeCount: number;
  declare builtinEdgeCount: number;
  declare unresolvedEdgeCount: number;
  declare limitReasons: ProjectDependencyIndexRunAttributes["limitReasons"];
  declare resolverWarnings: ProjectDependencyIndexRunAttributes["resolverWarnings"];
  declare errorCode: ProjectDependencyIndexRunAttributes["errorCode"];
  declare startedAt: Date;
  declare completedAt: Date | null;

  public static initialize(sequelize: Sequelize): ModelStatic<ProjectDependencyIndexRunModel> {
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
        sourceIndexRunId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "source_index_run_id",
        },
        status: {
          type: DataTypes.ENUM("running", "completed", "limited", "failed"),
          allowNull: false,
          defaultValue: "running",
        },
        resolutionContextHash: {
          type: DataTypes.CHAR(64),
          allowNull: true,
          field: "resolution_context_hash",
        },
        parsedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "parsed_file_count",
        },
        reusedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "reused_file_count",
        },
        unsupportedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "unsupported_file_count",
        },
        failedFileCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "failed_file_count",
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
        localEdgeCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "local_edge_count",
        },
        externalEdgeCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "external_edge_count",
        },
        builtinEdgeCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "builtin_edge_count",
        },
        unresolvedEdgeCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "unresolved_edge_count",
        },
        limitReasons: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: [],
          field: "limit_reasons",
        },
        resolverWarnings: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: [],
          field: "resolver_warnings",
        },
        errorCode: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "error_code",
        },
        startedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "started_at",
        },
        completedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "completed_at",
        },
      },
      {
        sequelize,
        modelName: "projectDependencyIndexRuns",
        tableName: "project_dependency_index_runs",
        timestamps: false,
        indexes: [
          {
            fields: ["project_id"],
            name: "project_dependency_runs_one_running_idx",
            unique: true,
            where: { status: "running" },
          },
          {
            fields: ["project_id", "started_at", "id"],
            name: "project_dependency_runs_project_started_idx",
          },
        ],
      },
    );
  }
}
