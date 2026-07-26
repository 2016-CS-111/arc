import type { RegisterProjectResponse } from "@arc/contracts";

import type { RegisterProjectInput } from "../domain/project.types.js";

export interface ProjectRepository {
  register(input: RegisterProjectInput): Promise<RegisterProjectResponse>;
}
