import {
  MemoryExportSchema,
  MemoryProposalSchema,
  MemoryRecordSchema,
  type MemoryDraft,
  type MemoryExport,
  type MemoryProposal,
  type MemoryRecord,
  type UpdateMemoryRequest,
} from "@arc/contracts";

export interface MemoryClientPort {
  approveProposal(proposalId: string): Promise<MemoryRecord>;
  create(input: MemoryDraft): Promise<MemoryRecord>;
  export(projectId: string | undefined): Promise<MemoryExport>;
  forget(memoryId: string): Promise<void>;
  import(records: readonly MemoryDraft[]): Promise<readonly MemoryRecord[]>;
  list(projectId: string | undefined, includeExpired?: boolean): Promise<readonly MemoryRecord[]>;
  rejectProposal(proposalId: string): Promise<MemoryProposal>;
  update(memoryId: string, input: UpdateMemoryRequest): Promise<MemoryRecord>;
}

export class MemoryClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MemoryClientError";
  }
}

export class MemoryClient implements MemoryClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public async list(projectId: string | undefined, includeExpired = false): Promise<readonly MemoryRecord[]> {
    const path = new URL("memories", `${this.backendUrl.replace(/\/$/, "")}/`);
    if (projectId !== undefined) {
      path.searchParams.set("projectId", projectId);
    }
    if (includeExpired) {
      path.searchParams.set("includeExpired", "true");
    }
    return MemoryRecordSchema.array().parse(await this.requestJson(path.toString()));
  }

  public async create(input: MemoryDraft): Promise<MemoryRecord> {
    return MemoryRecordSchema.parse(await this.requestJson("memories", this.jsonOptions("POST", input)));
  }

  public async update(memoryId: string, input: UpdateMemoryRequest): Promise<MemoryRecord> {
    return MemoryRecordSchema.parse(await this.requestJson(`memories/${memoryId}`, this.jsonOptions("PATCH", input)));
  }

  public async forget(memoryId: string): Promise<void> {
    const response = await this.request(`memories/${memoryId}`, { method: "DELETE" });
    if (response.status !== 204) {
      throw new MemoryClientError(`Arc backend returned HTTP ${String(response.status)}.`);
    }
  }

  public async approveProposal(proposalId: string): Promise<MemoryRecord> {
    return MemoryRecordSchema.parse(
      await this.requestJson(`memory-proposals/${proposalId}/approve`, { method: "POST" }),
    );
  }

  public async rejectProposal(proposalId: string): Promise<MemoryProposal> {
    return MemoryProposalSchema.parse(
      await this.requestJson(`memory-proposals/${proposalId}/reject`, { method: "POST" }),
    );
  }

  public async export(projectId: string | undefined): Promise<MemoryExport> {
    const path = new URL("memories/export", `${this.backendUrl.replace(/\/$/, "")}/`);
    if (projectId !== undefined) {
      path.searchParams.set("projectId", projectId);
    }
    return MemoryExportSchema.parse(await this.requestJson(path.toString()));
  }

  public async import(records: readonly MemoryDraft[]): Promise<readonly MemoryRecord[]> {
    return MemoryRecordSchema.array().parse(
      await this.requestJson("memories/import", this.jsonOptions("POST", { records })),
    );
  }

  private jsonOptions(method: "POST" | "PATCH", body: unknown): RequestInit {
    return {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    };
  }

  private async requestJson(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await this.request(path, options);
    try {
      return await response.json();
    } catch {
      throw new MemoryClientError("Arc backend returned an invalid memory response.");
    }
  }

  private async request(path: string, options: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch {
      throw new MemoryClientError("Arc backend is unavailable.");
    }
    if (!response.ok) {
      throw new MemoryClientError(`Arc backend returned HTTP ${String(response.status)}.`);
    }
    return response;
  }

  private urlFor(path: string): string {
    return path.startsWith("http") ? path : new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
