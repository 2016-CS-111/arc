export class MemoryNotFoundError extends Error {
  public constructor(memoryId: string) {
    super(`Arc memory ${memoryId} was not found.`);
    this.name = "MemoryNotFoundError";
  }
}

export class MemoryConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MemoryConflictError";
  }
}

export class MemoryProposalNotFoundError extends Error {
  public constructor(proposalId: string) {
    super(`Arc memory proposal ${proposalId} was not found.`);
    this.name = "MemoryProposalNotFoundError";
  }
}

export class MemoryProposalStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MemoryProposalStateError";
  }
}
