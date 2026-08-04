export class TaskProposalNotFoundError extends Error {
  public constructor(proposalId: string) {
    super(`Arc task proposal ${proposalId} was not found.`);
    this.name = "TaskProposalNotFoundError";
  }
}

export class TaskProposalConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TaskProposalConflictError";
  }
}

export class TaskProposalStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TaskProposalStateError";
  }
}
