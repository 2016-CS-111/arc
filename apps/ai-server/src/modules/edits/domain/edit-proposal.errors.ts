export class EditProposalNotFoundError extends Error {
  public constructor(proposalId: string) {
    super(`Arc edit proposal ${proposalId} was not found.`);
    this.name = "EditProposalNotFoundError";
  }
}

export class EditProposalConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EditProposalConflictError";
  }
}

export class EditProposalStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EditProposalStateError";
  }
}
