import { Module, type Provider } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import type { IgnoreRulesFileReader } from "./application/ignore-rules-file.reader.js";
import { ProjectIgnorePolicyService } from "./application/project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "./application/project-path.normalizer.js";
import { ProjectRegistrationService } from "./application/project-registration.service.js";
import type { ProjectRepository } from "./application/project.repository.js";
import type { WorkspaceRootResolver } from "./application/workspace-root-resolver.js";
import { NodeIgnoreRulesFileReader } from "./infrastructure/node-ignore-rules-file.reader.js";
import { NodeWorkspaceRootResolver } from "./infrastructure/node-workspace-root.resolver.js";
import { SequelizeProjectRepository } from "./infrastructure/sequelize-project.repository.js";
import { IGNORE_RULES_FILE_READER, PROJECT_REPOSITORY, WORKSPACE_ROOT_RESOLVER } from "./projects.constants.js";
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

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController],
  providers: [
    projectRepositoryProvider,
    workspaceRootResolverProvider,
    ignoreRulesFileReaderProvider,
    ProjectPathNormalizer,
    ProjectRegistrationService,
    ProjectIgnorePolicyService,
  ],
  exports: [PROJECT_REPOSITORY, ProjectRegistrationService, ProjectIgnorePolicyService],
})
export class ProjectsModule {}
