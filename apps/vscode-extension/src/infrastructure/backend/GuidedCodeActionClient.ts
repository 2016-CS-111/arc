import {
  GuidedCodeActionResponseSchema,
  type GuidedCodeActionRequest,
  type GuidedCodeActionResponse,
} from "@arc/contracts";

export interface GuidedCodeActionClientPort {
  cancel(requestId: string): Promise<void>;
  execute(request: GuidedCodeActionRequest, signal?: AbortSignal): Promise<GuidedCodeActionResponse>;
}

export class GuidedCodeActionClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GuidedCodeActionClientError";
  }
}

export class GuidedCodeActionClient implements GuidedCodeActionClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public async execute(request: GuidedCodeActionRequest, signal?: AbortSignal): Promise<GuidedCodeActionResponse> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor("guided-actions"), {
        body: JSON.stringify(request),
        headers: { "content-type": "application/json" },
        method: "POST",
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new GuidedCodeActionClientError("Arc backend is unavailable.");
    }
    if (!response.ok) {
      throw new GuidedCodeActionClientError(
        `Arc could not prepare this editor action (HTTP ${String(response.status)}).`,
      );
    }
    try {
      const parsed = GuidedCodeActionResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error();
      return parsed.data;
    } catch {
      throw new GuidedCodeActionClientError("Arc backend returned an invalid editor action response.");
    }
  }

  public async cancel(requestId: string): Promise<void> {
    try {
      await this.fetchImplementation(this.urlFor(`guided-actions/${requestId}/cancel`), { method: "POST" });
    } catch {
      // The request may already have finished locally.
    }
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
