import type { Sequelize } from "sequelize";

import type { ArcDatabaseModels } from "../database.types.js";
import { ChatMessageModel } from "./chat-message.model.js";
import { ChatSessionModel } from "./chat-session.model.js";
import { ProjectFileModel } from "./project-file.model.js";
import { ProjectModel } from "./project.model.js";
import { ProjectScanModel } from "./project-scan.model.js";
import { ProjectSourceFileModel } from "./project-source-file.model.js";
import { ProjectSourceIndexRunModel } from "./project-source-index-run.model.js";
import { ProjectSymbolFileModel } from "./project-symbol-file.model.js";
import { ProjectSymbolIndexRunModel } from "./project-symbol-index-run.model.js";
import { ProjectSymbolModel } from "./project-symbol.model.js";

export function createDatabaseModels(sequelize: Sequelize): ArcDatabaseModels {
  const models: ArcDatabaseModels = {
    chatSessions: ChatSessionModel.initialize(sequelize),
    chatMessages: ChatMessageModel.initialize(sequelize),
    projectFiles: ProjectFileModel.initialize(sequelize),
    projects: ProjectModel.initialize(sequelize),
    projectScans: ProjectScanModel.initialize(sequelize),
    projectSourceFiles: ProjectSourceFileModel.initialize(sequelize),
    projectSourceIndexRuns: ProjectSourceIndexRunModel.initialize(sequelize),
    projectSymbolFiles: ProjectSymbolFileModel.initialize(sequelize),
    projectSymbolIndexRuns: ProjectSymbolIndexRunModel.initialize(sequelize),
    projectSymbols: ProjectSymbolModel.initialize(sequelize),
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
  models.projects.hasMany(models.projectSourceIndexRuns, {
    as: "sourceIndexRuns",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectSourceIndexRuns.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectScans.hasMany(models.projectSourceIndexRuns, {
    as: "sourceIndexRuns",
    foreignKey: "inventoryScanId",
    onDelete: "CASCADE",
  });
  models.projectSourceIndexRuns.belongsTo(models.projectScans, {
    as: "inventoryScan",
    foreignKey: "inventoryScanId",
  });
  models.projects.hasMany(models.projectSourceFiles, {
    as: "sourceFiles",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectSourceFiles.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectSourceIndexRuns.hasMany(models.projectSourceFiles, {
    as: "sourceFiles",
    foreignKey: "sourceIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectSourceFiles.belongsTo(models.projectSourceIndexRuns, {
    as: "sourceIndexRun",
    foreignKey: "sourceIndexRunId",
  });
  models.projectScans.hasMany(models.projectSourceFiles, {
    as: "sourceFiles",
    foreignKey: "inventoryScanId",
    onDelete: "CASCADE",
  });
  models.projectSourceFiles.belongsTo(models.projectScans, {
    as: "inventoryScan",
    foreignKey: "inventoryScanId",
  });
  models.projects.hasMany(models.projectSymbolIndexRuns, {
    as: "symbolIndexRuns",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectSymbolIndexRuns.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectSourceIndexRuns.hasMany(models.projectSymbolIndexRuns, {
    as: "symbolIndexRuns",
    foreignKey: "sourceIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectSymbolIndexRuns.belongsTo(models.projectSourceIndexRuns, {
    as: "sourceIndexRun",
    foreignKey: "sourceIndexRunId",
  });
  models.projects.hasMany(models.projectSymbolFiles, {
    as: "symbolFiles",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectSymbolFiles.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectSymbolIndexRuns.hasMany(models.projectSymbolFiles, {
    as: "symbolFiles",
    foreignKey: "symbolIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectSymbolFiles.belongsTo(models.projectSymbolIndexRuns, {
    as: "symbolIndexRun",
    foreignKey: "symbolIndexRunId",
  });
  models.projectSymbolFiles.hasMany(models.projectSymbols, {
    as: "symbols",
    foreignKey: "symbolFileId",
    onDelete: "CASCADE",
  });
  models.projectSymbols.belongsTo(models.projectSymbolFiles, {
    as: "symbolFile",
    foreignKey: "symbolFileId",
  });
  models.projects.hasMany(models.projectSymbols, {
    as: "symbols",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectSymbols.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectSymbolIndexRuns.hasMany(models.projectSymbols, {
    as: "symbols",
    foreignKey: "symbolIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectSymbols.belongsTo(models.projectSymbolIndexRuns, {
    as: "symbolIndexRun",
    foreignKey: "symbolIndexRunId",
  });

  return models;
}
