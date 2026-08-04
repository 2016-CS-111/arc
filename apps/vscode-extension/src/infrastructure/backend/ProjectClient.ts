import {
  LatestProjectDependencyIndexResponseSchema,
  LatestProjectEmbeddingIndexResponseSchema,
  LatestProjectFrameworkIndexResponseSchema,
  LatestProjectScanResponseSchema,
  LatestProjectSourceIndexResponseSchema,
  LatestProjectSymbolIndexResponseSchema,
  ProjectDependencyIndexSchema,
  ProjectEmbeddingIndexSchema,
  ProjectFrameworkIndexSchema,
  ProjectScanSchema,
  ProjectSourceIndexSchema,
  ProjectSymbolIndexSchema,
  RegisterProjectResponseSchema,
  type LatestProjectDependencyIndexResponse,
  type LatestProjectEmbeddingIndexResponse,
  type LatestProjectFrameworkIndexResponse,
  type LatestProjectScanResponse,
  type LatestProjectSourceIndexResponse,
  type LatestProjectSymbolIndexResponse,
  type ProjectDependencyIndex,
  type ProjectEmbeddingIndex,
  type ProjectFrameworkIndex,
  type ProjectScan,
  type ProjectSourceIndex,
  type ProjectSymbolIndex,
  type RegisterProjectRequest,
  type RegisterProjectResponse,
} from "@arc/contracts";

export interface ProjectSourceIntelligenceStatus {
  readonly dependency: LatestProjectDependencyIndexResponse;
  readonly embedding: LatestProjectEmbeddingIndexResponse;
  readonly framework: LatestProjectFrameworkIndexResponse;
  readonly inventory: LatestProjectScanResponse;
  readonly source: LatestProjectSourceIndexResponse;
  readonly symbol: LatestProjectSymbolIndexResponse;
}

export interface ProjectClientPort {
  getLatestDependencyIndex(projectId: string): Promise<LatestProjectDependencyIndexResponse>;
  getLatestEmbeddingIndex(projectId: string): Promise<LatestProjectEmbeddingIndexResponse>;
  getLatestFrameworkIndex(projectId: string): Promise<LatestProjectFrameworkIndexResponse>;
  getLatestScan(projectId: string): Promise<LatestProjectScanResponse>;
  getLatestSourceIndex(projectId: string): Promise<LatestProjectSourceIndexResponse>;
  getLatestSymbolIndex(projectId: string): Promise<LatestProjectSymbolIndexResponse>;
  getSourceIntelligenceStatus(projectId: string): Promise<ProjectSourceIntelligenceStatus>;
  indexProjectDependencies(projectId: string): Promise<ProjectDependencyIndex>;
  indexProjectEmbeddings(projectId: string): Promise<ProjectEmbeddingIndex>;
  indexProjectFrameworks(projectId: string): Promise<ProjectFrameworkIndex>;
  indexProjectSource(projectId: string): Promise<ProjectSourceIndex>;
  indexProjectSymbols(projectId: string): Promise<ProjectSymbolIndex>;
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

  public async indexProjectSource(projectId: string): Promise<ProjectSourceIndex> {
    return this.requestValidated(
      `projects/${projectId}/sources/index`,
      { method: "POST" },
      ProjectSourceIndexSchema,
      "source index",
    );
  }

  public async getLatestSourceIndex(projectId: string): Promise<LatestProjectSourceIndexResponse> {
    return this.requestValidated(
      `projects/${projectId}/sources/index`,
      {},
      LatestProjectSourceIndexResponseSchema,
      "source index status",
    );
  }

  public async indexProjectSymbols(projectId: string): Promise<ProjectSymbolIndex> {
    return this.requestValidated(
      `projects/${projectId}/symbols/index`,
      { method: "POST" },
      ProjectSymbolIndexSchema,
      "symbol index",
    );
  }

  public async getLatestSymbolIndex(projectId: string): Promise<LatestProjectSymbolIndexResponse> {
    return this.requestValidated(
      `projects/${projectId}/symbols/index`,
      {},
      LatestProjectSymbolIndexResponseSchema,
      "symbol index status",
    );
  }

  public async indexProjectDependencies(projectId: string): Promise<ProjectDependencyIndex> {
    return this.requestValidated(
      `projects/${projectId}/dependencies/index`,
      { method: "POST" },
      ProjectDependencyIndexSchema,
      "dependency index",
    );
  }

  public async getLatestDependencyIndex(projectId: string): Promise<LatestProjectDependencyIndexResponse> {
    return this.requestValidated(
      `projects/${projectId}/dependencies/index`,
      {},
      LatestProjectDependencyIndexResponseSchema,
      "dependency index status",
    );
  }

  public async indexProjectEmbeddings(projectId: string): Promise<ProjectEmbeddingIndex> {
    return this.requestValidated(
      `projects/${projectId}/embeddings/index`,
      { method: "POST" },
      ProjectEmbeddingIndexSchema,
      "embedding index",
    );
  }

  public async getLatestEmbeddingIndex(projectId: string): Promise<LatestProjectEmbeddingIndexResponse> {
    return this.requestValidated(
      `projects/${projectId}/embeddings/index`,
      {},
      LatestProjectEmbeddingIndexResponseSchema,
      "embedding index status",
    );
  }

  public async indexProjectFrameworks(projectId: string): Promise<ProjectFrameworkIndex> {
    return this.requestValidated(
      `projects/${projectId}/frameworks/index`,
      { method: "POST" },
      ProjectFrameworkIndexSchema,
      "framework index",
    );
  }

  public async getLatestFrameworkIndex(projectId: string): Promise<LatestProjectFrameworkIndexResponse> {
    return this.requestValidated(
      `projects/${projectId}/frameworks/index`,
      {},
      LatestProjectFrameworkIndexResponseSchema,
      "framework index status",
    );
  }

  public async getSourceIntelligenceStatus(projectId: string): Promise<ProjectSourceIntelligenceStatus> {
    const [inventory, source, symbol, dependency, framework, embedding] = await Promise.all([
      this.getLatestScan(projectId),
      this.getLatestSourceIndex(projectId),
      this.getLatestSymbolIndex(projectId),
      this.getLatestDependencyIndex(projectId),
      this.getLatestFrameworkIndex(projectId),
      this.getLatestEmbeddingIndex(projectId),
    ]);
    return { dependency, embedding, framework, inventory, source, symbol };
  }

  private async requestValidated<T>(
    path: string,
    options: RequestInit,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    responseName: string,
  ): Promise<T> {
    const payload = await this.requestJson(path, options, responseName);
    const result = schema.safeParse(payload);
    if (!result.success) {
      throw new ProjectClientError(`Arc backend returned an invalid ${responseName} response.`);
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
