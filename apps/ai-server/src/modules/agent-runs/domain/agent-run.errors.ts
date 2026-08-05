export class AgentRunNotFoundError extends Error {
  public constructor(runId: string) {
    super(`Arc task run ${runId} was not found.`);
    this.name = "AgentRunNotFoundError";
  }
}

export class AgentRunStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgentRunStateError";
  }
}
