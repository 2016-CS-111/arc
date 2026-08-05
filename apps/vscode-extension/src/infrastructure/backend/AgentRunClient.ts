import { AgentRunSchema, type AgentRun, type AgentRunCreateRequest } from "@arc/contracts";

export interface AgentRunClientPort {
  cancel(runId: string): Promise<AgentRun>;
  create(request: AgentRunCreateRequest): Promise<AgentRun>;
  get(runId: string): Promise<AgentRun>;
  pause(runId: string): Promise<AgentRun>;
  resume(runId: string): Promise<AgentRun>;
  start(runId: string): Promise<AgentRun>;
}

export class AgentRunClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgentRunClientError";
  }
}

export class AgentRunClient implements AgentRunClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public create(request: AgentRunCreateRequest): Promise<AgentRun> {
    return this.requestRun("agent-runs", {
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  public get(runId: string): Promise<AgentRun> {
    return this.requestRun(`agent-runs/${runId}`);
  }

  public start(runId: string): Promise<AgentRun> {
    return this.transition(runId, "start");
  }

  public resume(runId: string): Promise<AgentRun> {
    return this.transition(runId, "resume");
  }

  public pause(runId: string): Promise<AgentRun> {
    return this.transition(runId, "pause");
  }

  public cancel(runId: string): Promise<AgentRun> {
    return this.transition(runId, "cancel");
  }

  private transition(runId: string, action: "start" | "resume" | "pause" | "cancel"): Promise<AgentRun> {
    return this.requestRun(`agent-runs/${runId}/${action}`, { method: "POST" });
  }

  private async requestRun(path: string, options: RequestInit = {}): Promise<AgentRun> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch {
      throw new AgentRunClientError("Arc backend is unavailable.");
    }
    if (!response.ok) {
      throw new AgentRunClientError(`Arc could not update the task run (HTTP ${String(response.status)}).`);
    }
    try {
      return AgentRunSchema.parse(await response.json());
    } catch {
      throw new AgentRunClientError("Arc backend returned an invalid task run response.");
    }
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
