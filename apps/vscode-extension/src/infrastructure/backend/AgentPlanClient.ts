import {
  AgentPlanSchema,
  type AgentPlan,
  type AgentPlanCreateRequest,
  type AgentPlanUpdateRequest,
} from "@arc/contracts";

export interface AgentPlanClientPort {
  create(request: AgentPlanCreateRequest, signal?: AbortSignal): Promise<AgentPlan>;
  get(planId: string): Promise<AgentPlan>;
  update(planId: string, request: AgentPlanUpdateRequest): Promise<AgentPlan>;
}

export class AgentPlanClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AgentPlanClientError";
  }
}

export class AgentPlanClient implements AgentPlanClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public create(request: AgentPlanCreateRequest, signal?: AbortSignal): Promise<AgentPlan> {
    return this.requestPlan(
      "agent-plans",
      {
        body: JSON.stringify(request),
        headers: { "content-type": "application/json" },
        method: "POST",
        ...(signal === undefined ? {} : { signal }),
      },
      "task plan",
    );
  }

  public get(planId: string): Promise<AgentPlan> {
    return this.requestPlan(`agent-plans/${planId}`, {}, "task plan");
  }

  public update(planId: string, request: AgentPlanUpdateRequest): Promise<AgentPlan> {
    return this.requestPlan(
      `agent-plans/${planId}`,
      { body: JSON.stringify(request), headers: { "content-type": "application/json" }, method: "PATCH" },
      "task plan",
    );
  }

  private async requestPlan(path: string, options: RequestInit, responseName: string): Promise<AgentPlan> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new AgentPlanClientError("Arc backend is unavailable.");
    }
    if (!response.ok) {
      throw new AgentPlanClientError(`Arc could not update the ${responseName} (HTTP ${String(response.status)}).`);
    }
    try {
      return AgentPlanSchema.parse(await response.json());
    } catch {
      throw new AgentPlanClientError("Arc backend returned an invalid task plan response.");
    }
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
