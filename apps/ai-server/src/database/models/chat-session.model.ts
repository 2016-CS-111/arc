import { DataTypes, Model, type ModelStatic, type Sequelize } from "sequelize";

import type { ChatSessionAttributes, ChatSessionCreationAttributes } from "../database.types.js";

export class ChatSessionModel extends Model<ChatSessionAttributes, ChatSessionCreationAttributes> {
  declare id: string;
  declare title: string;
  declare nextMessageOrdinal: number | string;
  declare createdAt: Date;
  declare updatedAt: Date;

  public static initialize(sequelize: Sequelize): ModelStatic<ChatSessionModel> {
    return this.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        title: {
          type: DataTypes.STRING(120),
          allowNull: false,
          defaultValue: "New chat",
        },
        nextMessageOrdinal: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
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
        modelName: "chatSessions",
        tableName: "chat_sessions",
        timestamps: true,
        underscored: true,
        indexes: [{ fields: ["updated_at", "id"], name: "chat_sessions_updated_at_idx" }],
      },
    );
  }
}
