import { Module, type Provider } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import { ProjectRegistrationService } from "./application/project-registration.service.js";
import type { ProjectRepository } from "./application/project.repository.js";
import type { WorkspaceRootResolver } from "./application/workspace-root-resolver.js";
import { NodeWorkspaceRootResolver } from "./infrastructure/node-workspace-root.resolver.js";
import { SequelizeProjectRepository } from "./infrastructure/sequelize-project.repository.js";
import { PROJECT_REPOSITORY, WORKSPACE_ROOT_RESOLVER } from "./projects.constants.js";
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

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController],
  providers: [projectRepositoryProvider, workspaceRootResolverProvider, ProjectRegistrationService],
  exports: [PROJECT_REPOSITORY, ProjectRegistrationService],
})
export class ProjectsModule {}
