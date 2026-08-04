import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../../config/config.constants.js";
import type { AppConfig } from "../../../../config/env.js";
import type { EmbeddingModelPort } from "../../application/embedding-model.port.js";
import { EmbeddingModelError } from "../../domain/embedding-model.errors.js";
import type {
  EmbeddingModelRequest,
  EmbeddingModelResult,
  EmbeddingModelStatus,
} from "../../domain/embedding-model.types.js";
import { OllamaEmbeddingResponseSchema, OllamaEmbeddingShowResponseSchema } from "./ollama-embedding.schemas.js";

@Injectable()
export class OllamaEmbeddingModelAdapter implements EmbeddingModelPort {
  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  public async getStatus(signal?: AbortSignal): Promise<EmbeddingModelStatus> {
    const model = this.config.embedding.model;
    if (model === undefined) {
      return {
        status: "not_configured",
        model: null,
        dimensions: null,
        latencyMs: null,
        message: "ARC_OLLAMA_EMBEDDING_MODEL is not configured.",
      };
    }

    const startedAt = performance.now();

    try {
      const response = await this.fetch(
        "api/show",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model }),
        },
        this.config.ollama.readinessTimeoutMs,
        signal,
      );
      const latencyMs = Math.round(performance.now() - startedAt);

      if (response.status === 404) {
        return {
          status: "model_missing",
          model,
          dimensions: this.config.embedding.dimensions,
          latencyMs,
          message: `The configured embedding model '${model}' is not installed.`,
        };
      }

      if (!response.ok) {
        return {
          status: "error",
          model,
          dimensions: this.config.embedding.dimensions,
          latencyMs,
          message: `Ollama returned HTTP ${String(response.status)} while checking the embedding model.`,
        };
      }

      OllamaEmbeddingShowResponseSchema.parse(await this.parseJson(response));

      return {
        status: "ready",
        model,
        dimensions: this.config.embedding.dimensions,
        latencyMs,
      };
    } catch (error) {
      const normalizedError = this.normalizeError(error, signal);

      return {
        status:
          normalizedError.code === "EMBEDDING_UNREACHABLE" || normalizedError.code === "EMBEDDING_TIMEOUT"
            ? "unreachable"
            : "error",
        model,
        dimensions: this.config.embedding.dimensions,
        latencyMs: Math.round(performance.now() - startedAt),
        message: normalizedError.message,
      };
    }
  }

  public async embed(request: EmbeddingModelRequest, signal?: AbortSignal): Promise<EmbeddingModelResult> {
    const model = this.config.embedding.model;
    if (model === undefined) {
      throw new EmbeddingModelError("EMBEDDING_NOT_CONFIGURED", "ARC_OLLAMA_EMBEDDING_MODEL is not configured.");
    }
    if (request.inputs.length === 0) {
      throw new EmbeddingModelError("EMBEDDING_REQUEST_FAILED", "At least one embedding input is required.");
    }

    try {
      const response = await this.fetch(
        "api/embed",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            input: request.inputs,
            truncate: false,
          }),
        },
        this.config.embedding.timeoutMs,
        signal,
      );

      if (response.status === 404) {
        throw new EmbeddingModelError(
          "EMBEDDING_MODEL_NOT_FOUND",
          `The configured embedding model '${model}' is not installed.`,
        );
      }
      if (!response.ok) {
        throw new EmbeddingModelError(
          "EMBEDDING_REQUEST_FAILED",
          `Ollama returned HTTP ${String(response.status)} while creating embeddings.`,
        );
      }

      const parsed = OllamaEmbeddingResponseSchema.parse(await this.parseJson(response));
      if (
        parsed.model !== model ||
        parsed.embeddings.length !== request.inputs.length ||
        parsed.embeddings.some((vector) => vector.length !== this.config.embedding.dimensions)
      ) {
        throw new EmbeddingModelError(
          "EMBEDDING_PROTOCOL_ERROR",
          "Ollama returned embeddings that do not match the configured model or dimensions.",
        );
      }

      return {
        provider: "ollama",
        model,
        dimensions: this.config.embedding.dimensions,
        inputFormat: "plain-v1",
        vectors: parsed.embeddings,
      };
    } catch (error) {
      throw this.normalizeError(error, signal);
    }
  }

  private async fetch(
    path: string,
    init: RequestInit,
    timeoutMs: number,
    callerSignal?: AbortSignal,
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal]);

    try {
      return await globalThis.fetch(new URL(path, `${this.config.ollama.baseUrl}/`), {
        ...init,
        signal,
      });
    } catch (error) {
      if (callerSignal?.aborted) {
        throw new EmbeddingModelError("EMBEDDING_CANCELLED", "The embedding request was cancelled.", {
          cause: error,
        });
      }
      if (timeoutSignal.aborted) {
        throw new EmbeddingModelError("EMBEDDING_TIMEOUT", "Ollama did not respond before the embedding timeout.", {
          cause: error,
        });
      }
      throw new EmbeddingModelError("EMBEDDING_UNREACHABLE", "Unable to connect to Ollama.", {
        cause: error,
      });
    }
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new EmbeddingModelError("EMBEDDING_PROTOCOL_ERROR", "Ollama returned invalid JSON.", {
        cause: error,
      });
    }
  }

  private normalizeError(error: unknown, signal?: AbortSignal): EmbeddingModelError {
    if (error instanceof EmbeddingModelError) {
      return error;
    }
    if (signal?.aborted) {
      return new EmbeddingModelError("EMBEDDING_CANCELLED", "The embedding request was cancelled.", {
        cause: error,
      });
    }
    return new EmbeddingModelError("EMBEDDING_PROTOCOL_ERROR", "Ollama returned an invalid embedding response.", {
      cause: error,
    });
  }
}
