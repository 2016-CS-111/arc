import type { Sequelize } from "sequelize";

import type { ArcDatabaseModels } from "../database.types.js";
import { ChatMessageModel } from "./chat-message.model.js";
import { ChatSessionModel } from "./chat-session.model.js";
import { ProjectModel } from "./project.model.js";

export function createDatabaseModels(sequelize: Sequelize): ArcDatabaseModels {
  const models: ArcDatabaseModels = {
    chatSessions: ChatSessionModel.initialize(sequelize),
    chatMessages: ChatMessageModel.initialize(sequelize),
    projects: ProjectModel.initialize(sequelize),
  };

  models.chatSessions.hasMany(models.chatMessages, {
    as: "messages",
    foreignKey: "sessionId",
    onDelete: "CASCADE",
  });
  models.chatMessages.belongsTo(models.chatSessions, {
    as: "session",
    foreignKey: "sessionId",
  });

  return models;
}
