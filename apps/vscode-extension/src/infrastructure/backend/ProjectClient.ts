import {
  RegisterProjectResponseSchema,
  type RegisterProjectRequest,
  type RegisterProjectResponse,
} from "@arc/contracts";

export interface ProjectClientPort {
  registerProject(request: RegisterProjectRequest): Promise<RegisterProjectResponse>;
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
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor("projects/register"), {
        body: JSON.stringify(request),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
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
      throw new ProjectClientError("Arc backend returned an invalid project response.");
    }

    const result = RegisterProjectResponseSchema.safeParse(payload);
    if (!result.success) {
      throw new ProjectClientError("Arc backend returned an invalid project response.");
    }

    return result.data;
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
