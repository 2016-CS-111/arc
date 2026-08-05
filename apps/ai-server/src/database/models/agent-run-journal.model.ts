import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { AgentRunJournalAttributes, AgentRunJournalCreationAttributes } from "../database.types.js";

export class AgentRunJournalModel extends Model<AgentRunJournalAttributes, AgentRunJournalCreationAttributes> {
  declare id: string;
  declare projectId: string;
  declare status: AgentRunJournalAttributes["status"];
  declare snapshot: AgentRunJournalAttributes["snapshot"];
  declare createdAt: Date;
  declare updatedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<AgentRunJournalModel> {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "project_id",
        },
        status: {
          type: DataTypes.STRING(16),
          allowNull: false,
        },
        snapshot: {
          type: DataTypes.JSONB,
          allowNull: false,
        },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
        updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
      },
      {
        sequelize,
        modelName: "agentRunJournals",
        tableName: "agent_run_journals",
        indexes: [
          { fields: ["project_id", "updated_at", "id"], name: "agent_run_journals_project_updated_idx" },
          { fields: ["status", "updated_at", "id"], name: "agent_run_journals_status_updated_idx" },
        ],
      },
    );
  }
}
