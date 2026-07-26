import type { Sequelize } from "sequelize";

import type { ArcDatabaseModels } from "../database.types.js";
import { ChatMessageModel } from "./chat-message.model.js";
import { ChatSessionModel } from "./chat-session.model.js";
import { ProjectFileModel } from "./project-file.model.js";
import { ProjectModel } from "./project.model.js";
import { ProjectScanModel } from "./project-scan.model.js";

export function createDatabaseModels(sequelize: Sequelize): ArcDatabaseModels {
  const models: ArcDatabaseModels = {
    chatSessions: ChatSessionModel.initialize(sequelize),
    chatMessages: ChatMessageModel.initialize(sequelize),
    projectFiles: ProjectFileModel.initialize(sequelize),
    projects: ProjectModel.initialize(sequelize),
    projectScans: ProjectScanModel.initialize(sequelize),
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
  models.projects.hasMany(models.projectScans, {
    as: "scans",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectScans.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projects.hasMany(models.projectFiles, {
    as: "files",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectFiles.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectScans.hasMany(models.projectFiles, {
    as: "files",
    foreignKey: "scanId",
    onDelete: "CASCADE",
  });
  models.projectFiles.belongsTo(models.projectScans, {
    as: "scan",
    foreignKey: "scanId",
  });

  return models;
}
