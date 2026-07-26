import {
  ProjectSchema,
  RegisterProjectResponseSchema,
  type Project,
  type RegisterProjectResponse,
} from "@arc/contracts";

import type { ArcDatabase, ProjectAttributes } from "../../../database/database.types.js";
import type { ProjectModel } from "../../../database/models/project.model.js";
import type { ProjectRepository } from "../application/project.repository.js";
import type { RegisterProjectInput } from "../domain/project.types.js";

export class SequelizeProjectRepository implements ProjectRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async findById(projectId: string): Promise<Project | null> {
    const project = await this.database.models.projects.findByPk(projectId);
    return project === null ? null : toProject(project);
  }

  public async register(input: RegisterProjectInput): Promise<RegisterProjectResponse> {
    const [project, created] = await this.database.models.projects.findOrCreate({
      where: { rootPath: input.rootPath },
      defaults: input,
    });

    if (!created && project.name !== input.name) {
      project.set("name", input.name);
      await project.save();
    }

    return RegisterProjectResponseSchema.parse({
      created,
      project: toProject(project),
    });
  }
}

function toProject(project: ProjectModel): Project {
  return toProjectAttributes(project.get());
}

function toProjectAttributes(attributes: ProjectAttributes): Project {
  return ProjectSchema.parse({
    id: attributes.id,
    name: attributes.name,
    rootPath: attributes.rootPath,
    createdAt: attributes.createdAt.toISOString(),
    updatedAt: attributes.updatedAt.toISOString(),
  });
}
