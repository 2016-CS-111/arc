import { EditProposalSchema, type EditProposal, type EditProposalSelection } from "@arc/contracts";

export interface EditProposalClientPort {
  approve(proposalId: string, selection: EditProposalSelection): Promise<EditProposal>;
  get(proposalId: string): Promise<EditProposal>;
  reject(proposalId: string): Promise<EditProposal>;
  undo(proposalId: string): Promise<EditProposal>;
}

export class EditProposalClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EditProposalClientError";
  }
}

export class EditProposalClient implements EditProposalClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public get(proposalId: string): Promise<EditProposal> {
    return this.requestProposal(`edit-proposals/${proposalId}`);
  }

  public approve(proposalId: string, selection: EditProposalSelection): Promise<EditProposal> {
    return this.requestProposal(`edit-proposals/${proposalId}/approve`, {
      body: JSON.stringify(selection),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  public reject(proposalId: string): Promise<EditProposal> {
    return this.requestProposal(`edit-proposals/${proposalId}/reject`, { method: "POST" });
  }

  public undo(proposalId: string): Promise<EditProposal> {
    return this.requestProposal(`edit-proposals/${proposalId}/undo`, { method: "POST" });
  }

  private async requestProposal(path: string, options: RequestInit = {}): Promise<EditProposal> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch {
      throw new EditProposalClientError("Arc backend is unavailable.");
    }
    if (!response.ok) {
      throw new EditProposalClientError(`Arc could not update the edit proposal (HTTP ${String(response.status)}).`);
    }
    try {
      return EditProposalSchema.parse(await response.json());
    } catch {
      throw new EditProposalClientError("Arc backend returned an invalid edit proposal response.");
    }
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
