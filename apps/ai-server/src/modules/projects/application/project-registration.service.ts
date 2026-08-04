import type { RegisterProjectRequest, RegisterProjectResponse } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PROJECT_REPOSITORY, WORKSPACE_ROOT_RESOLVER } from "../projects.constants.js";
import type { ProjectRepository } from "./project.repository.js";
import type { WorkspaceRootResolver } from "./workspace-root-resolver.js";

@Injectable()
export class ProjectRegistrationService {
  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(WORKSPACE_ROOT_RESOLVER)
    private readonly workspaceRootResolver: WorkspaceRootResolver,
  ) {}

  public async register(request: RegisterProjectRequest): Promise<RegisterProjectResponse> {
    const rootPath = await this.workspaceRootResolver.resolveDirectory(request.rootPath);
    return this.projectRepository.register({
      name: request.name,
      rootPath,
    });
  }
}
