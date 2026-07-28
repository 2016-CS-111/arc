import { Module, type Provider } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import type { IgnoreRulesFileReader } from "./application/ignore-rules-file.reader.js";
import type { ProjectDependencyIndexRepository } from "./application/project-dependency-index.repository.js";
import { ProjectDependencyIndexService } from "./application/project-dependency-index.service.js";
import { ProjectIgnorePolicyService } from "./application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "./application/project-inventory.service.js";
import type { ProjectInventoryRepository } from "./application/project-inventory.repository.js";
import type { ProjectModuleResolver } from "./application/project-module.resolver.js";
import { ProjectPathNormalizer } from "./application/project-path.normalizer.js";
import { ProjectRegistrationService } from "./application/project-registration.service.js";
import type { ProjectRepository } from "./application/project.repository.js";
import type { ProjectSourceIndexRepository } from "./application/project-source-index.repository.js";
import { ProjectSourceIndexService } from "./application/project-source-index.service.js";
import type { ProjectSymbolIndexRepository } from "./application/project-symbol-index.repository.js";
import { ProjectSymbolIndexService } from "./application/project-symbol-index.service.js";
import type { RepositoryInventoryWalker } from "./application/repository-inventory.walker.js";
import { SourceLanguageClassifier } from "./application/source-language.classifier.js";
import type { SourceTextReader } from "./application/source-text.reader.js";
import type { SourceDependencyExtractor } from "./application/source-dependency.extractor.js";
import type { SourceSymbolExtractor } from "./application/source-symbol.extractor.js";
import type { WorkspaceRootResolver } from "./application/workspace-root-resolver.js";
import { NodeIgnoreRulesFileReader } from "./infrastructure/node-ignore-rules-file.reader.js";
import { NodeRepositoryInventoryWalker } from "./infrastructure/node-repository-inventory.walker.js";
import { NodeSourceTextReader } from "./infrastructure/node-source-text.reader.js";
import { NodeWorkspaceRootResolver } from "./infrastructure/node-workspace-root.resolver.js";
import { SequelizeProjectInventoryRepository } from "./infrastructure/sequelize-project-inventory.repository.js";
import { SequelizeProjectDependencyIndexRepository } from "./infrastructure/sequelize-project-dependency-index.repository.js";
import { SequelizeProjectRepository } from "./infrastructure/sequelize-project.repository.js";
import { SequelizeProjectSourceIndexRepository } from "./infrastructure/sequelize-project-source-index.repository.js";
import { SequelizeProjectSymbolIndexRepository } from "./infrastructure/sequelize-project-symbol-index.repository.js";
import { TreeSitterSymbolExtractor } from "./infrastructure/tree-sitter/tree-sitter-symbol.extractor.js";
import { TreeSitterDependencyExtractor } from "./infrastructure/tree-sitter/tree-sitter-dependency.extractor.js";
import { TypeScriptProjectModuleResolver } from "./infrastructure/typescript/typescript-project-module.resolver.js";
import {
  IGNORE_RULES_FILE_READER,
  PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  PROJECT_INVENTORY_REPOSITORY,
  PROJECT_MODULE_RESOLVER,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  PROJECT_SYMBOL_INDEX_REPOSITORY,
  REPOSITORY_INVENTORY_WALKER,
  SOURCE_TEXT_READER,
  SOURCE_DEPENDENCY_EXTRACTOR,
  SOURCE_SYMBOL_EXTRACTOR,
  WORKSPACE_ROOT_RESOLVER,
} from "./projects.constants.js";
import { ProjectsController } from "./presentation/projects.controller.js";

const projectRepositoryProvider: Provider<ProjectRepository> = {
  provide: PROJECT_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): ProjectRepository => new SequelizeProjectRepository(database),
};

const workspaceRootResolverProvider: Provider<WorkspaceRootResolver> = {
  provide: WORKSPACE_ROOT_RESOLVER,
  useClass: NodeWorkspaceRootResolver,
};

const ignoreRulesFileReaderProvider: Provider<IgnoreRulesFileReader> = {
  provide: IGNORE_RULES_FILE_READER,
  useClass: NodeIgnoreRulesFileReader,
};

const projectInventoryRepositoryProvider: Provider<ProjectInventoryRepository> = {
  provide: PROJECT_INVENTORY_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): ProjectInventoryRepository => new SequelizeProjectInventoryRepository(database),
};

const projectDependencyIndexRepositoryProvider: Provider<ProjectDependencyIndexRepository> = {
  provide: PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): ProjectDependencyIndexRepository =>
    new SequelizeProjectDependencyIndexRepository(database),
};

const repositoryInventoryWalkerProvider: Provider<RepositoryInventoryWalker> = {
  provide: REPOSITORY_INVENTORY_WALKER,
  useClass: NodeRepositoryInventoryWalker,
};

const projectSourceIndexRepositoryProvider: Provider<ProjectSourceIndexRepository> = {
  provide: PROJECT_SOURCE_INDEX_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): ProjectSourceIndexRepository =>
    new SequelizeProjectSourceIndexRepository(database),
};

const sourceTextReaderProvider: Provider<SourceTextReader> = {
  provide: SOURCE_TEXT_READER,
  useClass: NodeSourceTextReader,
};

const projectSymbolIndexRepositoryProvider: Provider<ProjectSymbolIndexRepository> = {
  provide: PROJECT_SYMBOL_INDEX_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): ProjectSymbolIndexRepository =>
    new SequelizeProjectSymbolIndexRepository(database),
};

const sourceSymbolExtractorProvider: Provider<SourceSymbolExtractor> = {
  provide: SOURCE_SYMBOL_EXTRACTOR,
  useClass: TreeSitterSymbolExtractor,
};

const sourceDependencyExtractorProvider: Provider<SourceDependencyExtractor> = {
  provide: SOURCE_DEPENDENCY_EXTRACTOR,
  useClass: TreeSitterDependencyExtractor,
};

const projectModuleResolverProvider: Provider<ProjectModuleResolver> = {
  provide: PROJECT_MODULE_RESOLVER,
  useClass: TypeScriptProjectModuleResolver,
};

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController],
  providers: [
    projectRepositoryProvider,
    projectInventoryRepositoryProvider,
    projectDependencyIndexRepositoryProvider,
    projectSourceIndexRepositoryProvider,
    projectSymbolIndexRepositoryProvider,
    workspaceRootResolverProvider,
    ignoreRulesFileReaderProvider,
    repositoryInventoryWalkerProvider,
    sourceTextReaderProvider,
    sourceSymbolExtractorProvider,
    sourceDependencyExtractorProvider,
    projectModuleResolverProvider,
    ProjectPathNormalizer,
    ProjectRegistrationService,
    ProjectIgnorePolicyService,
    ProjectInventoryService,
    ProjectDependencyIndexService,
    ProjectSourceIndexService,
    ProjectSymbolIndexService,
    SourceLanguageClassifier,
  ],
  exports: [
    PROJECT_REPOSITORY,
    ProjectRegistrationService,
    ProjectIgnorePolicyService,
    ProjectInventoryService,
    ProjectDependencyIndexService,
    ProjectSourceIndexService,
    ProjectSymbolIndexService,
  ],
})
export class ProjectsModule {}
