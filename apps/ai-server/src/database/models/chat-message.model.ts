import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ChatMessageAttributes, ChatMessageCreationAttributes } from "../database.types.js";

export class ChatMessageModel extends Model<ChatMessageAttributes, ChatMessageCreationAttributes> {
  declare id: string;
  declare sessionId: string;
  declare requestId: string;
  declare ordinal: number | string;
  declare role: ChatMessageAttributes["role"];
  declare status: ChatMessageAttributes["status"];
  declare content: string;
  declare error: ChatMessageAttributes["error"];
  declare createdAt: Date;
  declare updatedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ChatMessageModel> {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
        },
        sessionId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "session_id",
          references: {
            model: "chat_sessions",
            key: "id",
          },
        },
        requestId: {
          type: DataTypes.STRING(160),
          allowNull: false,
          field: "request_id",
        },
        ordinal: {
          type: DataTypes.BIGINT,
          allowNull: false,
        },
        role: {
          type: DataTypes.ENUM("user", "assistant"),
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM("pending", "streaming", "completed", "cancelled", "failed"),
          allowNull: false,
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: "",
        },
        error: {
          type: DataTypes.JSONB,
          allowNull: true,
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
        modelName: "chatMessages",
        tableName: "chat_messages",
        timestamps: true,
        underscored: true,
      },
    );
  }
}
