import {
  LatestProjectScanResponseSchema,
  ProjectScanSchema,
  RegisterProjectResponseSchema,
  type LatestProjectScanResponse,
  type ProjectScan,
  type RegisterProjectRequest,
  type RegisterProjectResponse,
} from "@arc/contracts";

export interface ProjectClientPort {
  getLatestScan(projectId: string): Promise<LatestProjectScanResponse>;
  registerProject(request: RegisterProjectRequest): Promise<RegisterProjectResponse>;
  scanProject(projectId: string): Promise<ProjectScan>;
}

export class ProjectClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectClientError";
  }
}

export class ProjectClient implements ProjectClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public async registerProject(request: RegisterProjectRequest): Promise<RegisterProjectResponse> {
    const payload = await this.requestJson(
      "projects/register",
      {
        body: JSON.stringify(request),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      "project registration",
    );
    const result = RegisterProjectResponseSchema.safeParse(payload);
    if (!result.success) {
      throw new ProjectClientError("Arc backend returned an invalid project registration response.");
    }

    return result.data;
  }

  public async scanProject(projectId: string): Promise<ProjectScan> {
    const payload = await this.requestJson(`projects/${projectId}/inventory/scan`, { method: "POST" }, "project scan");
    const result = ProjectScanSchema.safeParse(payload);
    if (!result.success) {
      throw new ProjectClientError("Arc backend returned an invalid project scan response.");
    }

    return result.data;
  }

  public async getLatestScan(projectId: string): Promise<LatestProjectScanResponse> {
    const payload = await this.requestJson(`projects/${projectId}/inventory/scan`, {}, "project scan status");
    const result = LatestProjectScanResponseSchema.safeParse(payload);
    if (!result.success) {
      throw new ProjectClientError("Arc backend returned an invalid project scan status response.");
    }

    return result.data;
  }

  private async requestJson(path: string, options: RequestInit, responseName: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch {
      throw new ProjectClientError("Arc backend is unavailable.");
    }

    if (!response.ok) {
      throw new ProjectClientError(`Arc backend returned HTTP ${String(response.status)}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ProjectClientError(`Arc backend returned invalid ${responseName} JSON.`);
    }

    return payload;
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
