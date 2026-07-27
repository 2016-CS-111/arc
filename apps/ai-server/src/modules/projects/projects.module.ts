import { Module, type Provider } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import type { IgnoreRulesFileReader } from "./application/ignore-rules-file.reader.js";
import { ProjectIgnorePolicyService } from "./application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "./application/project-inventory.service.js";
import type { ProjectInventoryRepository } from "./application/project-inventory.repository.js";
import { ProjectPathNormalizer } from "./application/project-path.normalizer.js";
import { ProjectRegistrationService } from "./application/project-registration.service.js";
import type { ProjectRepository } from "./application/project.repository.js";
import type { ProjectSourceIndexRepository } from "./application/project-source-index.repository.js";
import { ProjectSourceIndexService } from "./application/project-source-index.service.js";
import type { RepositoryInventoryWalker } from "./application/repository-inventory.walker.js";
import { SourceLanguageClassifier } from "./application/source-language.classifier.js";
import type { SourceTextReader } from "./application/source-text.reader.js";
import type { WorkspaceRootResolver } from "./application/workspace-root-resolver.js";
import { NodeIgnoreRulesFileReader } from "./infrastructure/node-ignore-rules-file.reader.js";
import { NodeRepositoryInventoryWalker } from "./infrastructure/node-repository-inventory.walker.js";
import { NodeSourceTextReader } from "./infrastructure/node-source-text.reader.js";
import { NodeWorkspaceRootResolver } from "./infrastructure/node-workspace-root.resolver.js";
import { SequelizeProjectInventoryRepository } from "./infrastructure/sequelize-project-inventory.repository.js";
import { SequelizeProjectRepository } from "./infrastructure/sequelize-project.repository.js";
import { SequelizeProjectSourceIndexRepository } from "./infrastructure/sequelize-project-source-index.repository.js";
import {
  IGNORE_RULES_FILE_READER,
  PROJECT_INVENTORY_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  REPOSITORY_INVENTORY_WALKER,
  SOURCE_TEXT_READER,
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

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController],
  providers: [
    projectRepositoryProvider,
    projectInventoryRepositoryProvider,
    projectSourceIndexRepositoryProvider,
    workspaceRootResolverProvider,
    ignoreRulesFileReaderProvider,
    repositoryInventoryWalkerProvider,
    sourceTextReaderProvider,
    ProjectPathNormalizer,
    ProjectRegistrationService,
    ProjectIgnorePolicyService,
    ProjectInventoryService,
    ProjectSourceIndexService,
    SourceLanguageClassifier,
  ],
  exports: [
    PROJECT_REPOSITORY,
    ProjectRegistrationService,
    ProjectIgnorePolicyService,
    ProjectInventoryService,
    ProjectSourceIndexService,
  ],
})
export class ProjectsModule {}
