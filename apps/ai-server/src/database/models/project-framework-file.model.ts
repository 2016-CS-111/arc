import { DataTypes, Model, type ModelStatic, type Optional, type Sequelize } from "sequelize";
import type {
  SourceFrameworkEvidence,
  SourceFrameworkEvidenceOmissionReason,
} from "../../modules/projects/domain/project-framework.types.js";

export interface ProjectFrameworkFileModelAttributes {
  readonly id: string;
  readonly projectId: string;
  readonly frameworkIndexRunId: string;
  readonly scopeId: string;
  readonly sourceFileId: string;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly analyzerIdentity: string;
  readonly extractorIdentity: string;
  readonly evidence: readonly SourceFrameworkEvidence[];
  readonly extractionOmissionCount: number;
  readonly extractionOmissionReasons: readonly SourceFrameworkEvidenceOmissionReason[];
  readonly status: "analyzed" | "analyzed_with_errors" | "unsupported" | "failed" | "limited";
  readonly hasSyntaxErrors: boolean;
  readonly entityCount: number;
  readonly relationshipCount: number;
  readonly omissionCount: number;
  readonly errorCode: string | null;
  readonly analyzedAt: Date;
}
export class ProjectFrameworkFileModel extends Model<
  ProjectFrameworkFileModelAttributes,
  Optional<
    ProjectFrameworkFileModelAttributes,
    | "id"
    | "hasSyntaxErrors"
    | "entityCount"
    | "relationshipCount"
    | "omissionCount"
    | "errorCode"
    | "analyzedAt"
    | "extractorIdentity"
    | "evidence"
    | "extractionOmissionCount"
    | "extractionOmissionReasons"
  >
> {
  declare id: string;
  declare projectId: string;
  declare frameworkIndexRunId: string;
  declare scopeId: string;
  declare sourceFileId: string;
  declare relativePath: string;
  declare sourceContentHash: string;
  declare language: string;
  declare analyzerIdentity: string;
  declare extractorIdentity: string;
  declare evidence: readonly SourceFrameworkEvidence[];
  declare extractionOmissionCount: number;
  declare extractionOmissionReasons: readonly SourceFrameworkEvidenceOmissionReason[];
  declare status: ProjectFrameworkFileModelAttributes["status"];
  declare hasSyntaxErrors: boolean;
  declare entityCount: number;
  declare relationshipCount: number;
  declare omissionCount: number;
  declare errorCode: string | null;
  declare analyzedAt: Date;
  public static initialize(sequelize: Sequelize): ModelStatic<ProjectFrameworkFileModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        projectId: { type: DataTypes.UUID, allowNull: false, field: "project_id" },
        frameworkIndexRunId: { type: DataTypes.UUID, allowNull: false, field: "framework_index_run_id" },
        scopeId: { type: DataTypes.UUID, allowNull: false, field: "scope_id" },
        sourceFileId: { type: DataTypes.UUID, allowNull: false, field: "source_file_id" },
        relativePath: { type: DataTypes.TEXT, allowNull: false, field: "relative_path" },
        sourceContentHash: { type: DataTypes.CHAR(64), allowNull: false, field: "source_content_hash" },
        language: { type: DataTypes.STRING(64), allowNull: false },
        analyzerIdentity: { type: DataTypes.TEXT, allowNull: false, field: "analyzer_identity" },
        extractorIdentity: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: "unsupported",
          field: "extractor_identity",
        },
        evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
        extractionOmissionCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "extraction_omission_count",
        },
        extractionOmissionReasons: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: [],
          field: "extraction_omission_reasons",
        },
        status: {
          type: DataTypes.ENUM("analyzed", "analyzed_with_errors", "unsupported", "failed", "limited"),
          allowNull: false,
        },
        hasSyntaxErrors: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "has_syntax_errors" },
        entityCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "entity_count" },
        relationshipCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "relationship_count" },
        omissionCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "omission_count" },
        errorCode: { type: DataTypes.STRING(64), allowNull: true, field: "error_code" },
        analyzedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "analyzed_at" },
      },
      {
        sequelize,
        modelName: "projectFrameworkFiles",
        tableName: "project_framework_files",
        timestamps: false,
        indexes: [{ fields: ["project_id", "scope_id", "source_file_id"], unique: true }],
      },
    );
  }
}
