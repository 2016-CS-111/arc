import {
  CodeCompletionResponseSchema,
  CodeCompletionStatusResponseSchema,
  type CodeCompletionRequest,
  type CodeCompletionResponse,
  type CodeCompletionStatusResponse,
} from "@arc/contracts";

export interface CompletionClientPort {
  complete(request: CodeCompletionRequest, signal?: AbortSignal): Promise<CodeCompletionResponse>;
  getStatus(signal?: AbortSignal): Promise<CodeCompletionStatusResponse>;
}

export class CompletionClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CompletionClientError";
  }
}

export class CompletionClient implements CompletionClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public async complete(request: CodeCompletionRequest, signal?: AbortSignal): Promise<CodeCompletionResponse> {
    const payload = await this.requestJson(
      "completions",
      {
        body: JSON.stringify(request),
        headers: { "content-type": "application/json" },
        method: "POST",
        ...(signal === undefined ? {} : { signal }),
      },
      "completion",
    );
    const parsed = CodeCompletionResponseSchema.safeParse(payload);
    if (!parsed.success) throw new CompletionClientError("Arc backend returned an invalid completion response.");
    return parsed.data;
  }

  public async getStatus(signal?: AbortSignal): Promise<CodeCompletionStatusResponse> {
    const payload = await this.requestJson(
      "completions/status",
      signal === undefined ? {} : { signal },
      "completion status",
    );
    const parsed = CodeCompletionStatusResponseSchema.safeParse(payload);
    if (!parsed.success) throw new CompletionClientError("Arc backend returned an invalid completion status response.");
    return parsed.data;
  }

  private async requestJson(path: string, options: RequestInit, responseName: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new CompletionClientError("Arc backend is unavailable.");
    }
    if (!response.ok)
      throw new CompletionClientError(`Arc backend returned HTTP ${String(response.status)} for ${responseName}.`);
    try {
      return await response.json();
    } catch {
      throw new CompletionClientError(`Arc backend returned invalid ${responseName} JSON.`);
    }
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
