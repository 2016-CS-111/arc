export class AgentPlanConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgentPlanConflictError";
  }
}

export class AgentPlanNotFoundError extends Error {
  public constructor(planId: string) {
    super(`Arc task plan ${planId} was not found.`);
    this.name = "AgentPlanNotFoundError";
  }
}
