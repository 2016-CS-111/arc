import { TaskProposalSchema, type TaskProposal } from "@arc/contracts";

export interface TaskProposalClientPort {
  approve(proposalId: string): Promise<TaskProposal>;
  cancel(proposalId: string): Promise<TaskProposal>;
  get(proposalId: string): Promise<TaskProposal>;
  reject(proposalId: string): Promise<TaskProposal>;
}

export class TaskProposalClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TaskProposalClientError";
  }
}

export class TaskProposalClient implements TaskProposalClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public get(proposalId: string): Promise<TaskProposal> {
    return this.requestProposal(`task-proposals/${proposalId}`);
  }

  public approve(proposalId: string): Promise<TaskProposal> {
    return this.requestProposal(`task-proposals/${proposalId}/approve`, {
      body: JSON.stringify({ confirmed: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  public reject(proposalId: string): Promise<TaskProposal> {
    return this.requestProposal(`task-proposals/${proposalId}/reject`, { method: "POST" });
  }

  public cancel(proposalId: string): Promise<TaskProposal> {
    return this.requestProposal(`task-proposals/${proposalId}/cancel`, { method: "POST" });
  }

  private async requestProposal(path: string, options: RequestInit = {}): Promise<TaskProposal> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch {
      throw new TaskProposalClientError("Arc backend is unavailable.");
    }
    if (!response.ok) {
      throw new TaskProposalClientError(`Arc could not update the task proposal (HTTP ${String(response.status)}).`);
    }
    try {
      return TaskProposalSchema.parse(await response.json());
    } catch {
      throw new TaskProposalClientError("Arc backend returned an invalid task proposal response.");
    }
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
