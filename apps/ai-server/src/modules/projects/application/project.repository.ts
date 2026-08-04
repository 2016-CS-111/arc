import type { Project, RegisterProjectResponse } from "@arc/contracts";

import type { RegisterProjectInput } from "../domain/project.types.js";

export interface ProjectRepository {
  findById(projectId: string): Promise<Project | null>;
  register(input: RegisterProjectInput): Promise<RegisterProjectResponse>;
}
