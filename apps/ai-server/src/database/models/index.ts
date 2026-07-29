import type { Sequelize } from "sequelize";

import type { ArcDatabaseModels } from "../database.types.js";
import { ChatMessageModel } from "./chat-message.model.js";
import { ChatSessionModel } from "./chat-session.model.js";
import { ProjectDependencyBindingModel } from "./project-dependency-binding.model.js";
import { ProjectDependencyEdgeModel } from "./project-dependency-edge.model.js";
import { ProjectDependencyFileModel } from "./project-dependency-file.model.js";
import { ProjectDependencyIndexRunModel } from "./project-dependency-index-run.model.js";
import { ProjectFileModel } from "./project-file.model.js";
import { ProjectModel } from "./project.model.js";
import { ProjectScanModel } from "./project-scan.model.js";
import { ProjectSourceFileModel } from "./project-source-file.model.js";
import { ProjectSourceIndexRunModel } from "./project-source-index-run.model.js";
import { ProjectSymbolFileModel } from "./project-symbol-file.model.js";
import { ProjectSymbolIndexRunModel } from "./project-symbol-index-run.model.js";
import { ProjectSymbolModel } from "./project-symbol.model.js";
import { ProjectFrameworkIndexRunModel } from "./project-framework-index-run.model.js";
import { ProjectFrameworkScopeModel } from "./project-framework-scope.model.js";
import { ProjectFrameworkFileModel } from "./project-framework-file.model.js";
import { ProjectFrameworkEntityModel } from "./project-framework-entity.model.js";
import { ProjectFrameworkRelationshipModel } from "./project-framework-relationship.model.js";

export function createDatabaseModels(sequelize: Sequelize): ArcDatabaseModels {
  const models: ArcDatabaseModels = {
    projectFrameworkIndexRuns: ProjectFrameworkIndexRunModel.initialize(sequelize),
    projectFrameworkScopes: ProjectFrameworkScopeModel.initialize(sequelize),
    projectFrameworkFiles: ProjectFrameworkFileModel.initialize(sequelize),
    projectFrameworkEntities: ProjectFrameworkEntityModel.initialize(sequelize),
    projectFrameworkRelationships: ProjectFrameworkRelationshipModel.initialize(sequelize),
    chatSessions: ChatSessionModel.initialize(sequelize),
    chatMessages: ChatMessageModel.initialize(sequelize),
    projectDependencyBindings: ProjectDependencyBindingModel.initialize(sequelize),
    projectDependencyEdges: ProjectDependencyEdgeModel.initialize(sequelize),
    projectDependencyFiles: ProjectDependencyFileModel.initialize(sequelize),
    projectDependencyIndexRuns: ProjectDependencyIndexRunModel.initialize(sequelize),
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
  models.projects.hasMany(models.projectFrameworkIndexRuns, {
    as: "frameworkIndexRuns",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectFrameworkIndexRuns.belongsTo(models.projects, { as: "project", foreignKey: "projectId" });
  models.projects.hasMany(models.projectFrameworkScopes, {
    as: "frameworkScopes",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectFrameworkScopes.belongsTo(models.projects, { as: "project", foreignKey: "projectId" });
  models.projectFrameworkIndexRuns.hasMany(models.projectFrameworkScopes, {
    as: "scopes",
    foreignKey: "frameworkIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectFrameworkScopes.belongsTo(models.projectFrameworkIndexRuns, {
    as: "frameworkIndexRun",
    foreignKey: "frameworkIndexRunId",
  });
  models.projects.hasMany(models.projectFrameworkFiles, {
    as: "frameworkFiles",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectFrameworkFiles.belongsTo(models.projects, { as: "project", foreignKey: "projectId" });
  models.projectFrameworkScopes.hasMany(models.projectFrameworkFiles, {
    as: "files",
    foreignKey: "scopeId",
    onDelete: "CASCADE",
  });
  models.projectFrameworkFiles.belongsTo(models.projectFrameworkScopes, { as: "scope", foreignKey: "scopeId" });
  models.projectFrameworkFiles.hasMany(models.projectFrameworkEntities, {
    as: "entities",
    foreignKey: "frameworkFileId",
    onDelete: "CASCADE",
  });
  models.projectFrameworkEntities.belongsTo(models.projectFrameworkFiles, {
    as: "file",
    foreignKey: "frameworkFileId",
  });
  models.projectFrameworkEntities.hasMany(models.projectFrameworkRelationships, {
    as: "outgoingRelationships",
    foreignKey: "sourceEntityId",
    onDelete: "CASCADE",
  });
  models.projectFrameworkRelationships.belongsTo(models.projectFrameworkEntities, {
    as: "sourceEntity",
    foreignKey: "sourceEntityId",
  });
  models.projectFrameworkRelationships.belongsTo(models.projectFrameworkEntities, {
    as: "targetEntity",
    foreignKey: "targetEntityId",
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
  models.projects.hasMany(models.projectDependencyIndexRuns, {
    as: "dependencyIndexRuns",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectDependencyIndexRuns.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectSourceIndexRuns.hasMany(models.projectDependencyIndexRuns, {
    as: "dependencyIndexRuns",
    foreignKey: "sourceIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectDependencyIndexRuns.belongsTo(models.projectSourceIndexRuns, {
    as: "sourceIndexRun",
    foreignKey: "sourceIndexRunId",
  });
  models.projects.hasMany(models.projectDependencyFiles, {
    as: "dependencyFiles",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectDependencyFiles.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectDependencyIndexRuns.hasMany(models.projectDependencyFiles, {
    as: "dependencyFiles",
    foreignKey: "dependencyIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectDependencyFiles.belongsTo(models.projectDependencyIndexRuns, {
    as: "dependencyIndexRun",
    foreignKey: "dependencyIndexRunId",
  });
  models.projectDependencyFiles.hasMany(models.projectDependencyEdges, {
    as: "edges",
    foreignKey: "dependencyFileId",
    onDelete: "CASCADE",
  });
  models.projectDependencyEdges.belongsTo(models.projectDependencyFiles, {
    as: "dependencyFile",
    foreignKey: "dependencyFileId",
  });
  models.projects.hasMany(models.projectDependencyEdges, {
    as: "dependencyEdges",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectDependencyEdges.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectDependencyIndexRuns.hasMany(models.projectDependencyEdges, {
    as: "dependencyEdges",
    foreignKey: "dependencyIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectDependencyEdges.belongsTo(models.projectDependencyIndexRuns, {
    as: "dependencyIndexRun",
    foreignKey: "dependencyIndexRunId",
  });
  models.projectDependencyEdges.hasMany(models.projectDependencyBindings, {
    as: "bindings",
    foreignKey: "dependencyEdgeId",
    onDelete: "CASCADE",
  });
  models.projectDependencyBindings.belongsTo(models.projectDependencyEdges, {
    as: "dependencyEdge",
    foreignKey: "dependencyEdgeId",
  });
  models.projects.hasMany(models.projectDependencyBindings, {
    as: "dependencyBindings",
    foreignKey: "projectId",
    onDelete: "CASCADE",
  });
  models.projectDependencyBindings.belongsTo(models.projects, {
    as: "project",
    foreignKey: "projectId",
  });
  models.projectDependencyIndexRuns.hasMany(models.projectDependencyBindings, {
    as: "dependencyBindings",
    foreignKey: "dependencyIndexRunId",
    onDelete: "CASCADE",
  });
  models.projectDependencyBindings.belongsTo(models.projectDependencyIndexRuns, {
    as: "dependencyIndexRun",
    foreignKey: "dependencyIndexRunId",
  });

  return models;
}
