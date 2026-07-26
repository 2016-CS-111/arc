import type { CheckProjectPathRequest, ProjectIgnoreDecision } from "@arc/contracts";

export interface ProjectIgnoreEvaluator {
  check(request: CheckProjectPathRequest): Promise<ProjectIgnoreDecision>;
}
