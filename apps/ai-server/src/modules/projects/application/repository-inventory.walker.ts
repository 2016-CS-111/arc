import type { ProjectIgnoreEvaluator } from "./project-ignore.evaluator.js";
import type { ProjectInventoryWalkResult, ProjectScanLimits } from "../domain/project-inventory.types.js";

export interface RepositoryInventoryWalker {
  walk(
    rootPath: string,
    ignoreEvaluator: ProjectIgnoreEvaluator,
    limits: ProjectScanLimits,
  ): Promise<ProjectInventoryWalkResult>;
}
