import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { SecurityAuditEventAttributes, SecurityAuditEventCreationAttributes } from "../database.types.js";

export class SecurityAuditEventModel extends Model<SecurityAuditEventAttributes, SecurityAuditEventCreationAttributes> {
  declare id: string;
  declare category: SecurityAuditEventAttributes["category"];
  declare action: string;
  declare status: string;
  declare subjectId: string;
  declare projectId: string | null;
  declare requestId: string | null;
  declare sessionId: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<SecurityAuditEventModel> {
    return this.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true },
        category: { type: DataTypes.STRING(16), allowNull: false },
        action: { type: DataTypes.STRING(64), allowNull: false },
        status: { type: DataTypes.STRING(32), allowNull: false },
        subjectId: { type: DataTypes.STRING(160), allowNull: false, field: "subject_id" },
        projectId: { type: DataTypes.UUID, allowNull: true, field: "project_id" },
        requestId: { type: DataTypes.STRING(160), allowNull: true, field: "request_id" },
        sessionId: { type: DataTypes.UUID, allowNull: true, field: "session_id" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
        updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
      },
      {
        sequelize,
        modelName: "securityAuditEvents",
        tableName: "security_audit_events",
        indexes: [
          { fields: ["created_at", "id"], name: "security_audit_events_created_idx" },
          { fields: ["project_id", "created_at", "id"], name: "security_audit_events_project_created_idx" },
        ],
      },
    );
  }
}
