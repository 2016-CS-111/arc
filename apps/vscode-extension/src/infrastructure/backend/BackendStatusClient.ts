import {
  HealthResponseSchema,
  OllamaProviderStatusResponseSchema,
  type HealthResponse,
  type OllamaProviderStatusResponse,
} from "@arc/contracts";

export interface BackendStatus {
  readonly backend: HealthResponse | null;
  readonly error?: string;
  readonly ollama: OllamaProviderStatusResponse | null;
}

export class BackendStatusClient {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public async getStatus(signal?: AbortSignal): Promise<BackendStatus> {
    try {
      const healthResponse = await this.fetchImplementation(this.urlFor("health"), requestOptions(signal));
      if (!healthResponse.ok) {
        return {
          backend: null,
          error: `Arc backend returned HTTP ${String(healthResponse.status)}.`,
          ollama: null,
        };
      }

      const healthJson: unknown = await healthResponse.json();
      const backend = HealthResponseSchema.parse(healthJson);

      try {
        const ollamaResponse = await this.fetchImplementation(
          this.urlFor("providers/ollama/status"),
          requestOptions(signal),
        );
        if (!ollamaResponse.ok) {
          return {
            backend,
            error: `Ollama status check returned HTTP ${String(ollamaResponse.status)}.`,
            ollama: null,
          };
        }

        const ollamaJson: unknown = await ollamaResponse.json();
        return {
          backend,
          ollama: OllamaProviderStatusResponseSchema.parse(ollamaJson),
        };
      } catch {
        return {
          backend,
          error: "Arc backend is reachable, but its Ollama status is unavailable.",
          ollama: null,
        };
      }
    } catch {
      return {
        backend: null,
        error: "Arc backend is unavailable.",
        ollama: null,
      };
    }
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}

function requestOptions(signal: AbortSignal | undefined): RequestInit {
  return signal === undefined ? {} : { signal };
}
