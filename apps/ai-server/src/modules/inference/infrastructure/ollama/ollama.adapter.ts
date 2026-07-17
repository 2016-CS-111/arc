import { APP_CONFIG } from "../../../../config/config.constants.js";
import type { AppConfig } from "../../../../config/env.js";
import { ARC_LOGGER } from "../../../logger/logger.constants.js";
import type { Logger } from "@arc/shared";
import { Inject, Injectable } from "@nestjs/common";

import type { ChatModelPort } from "../../application/chat-model.port.js";
import { ChatModelError } from "../../domain/chat-model.errors.js";
import type {
  ChatModelEvent,
  ChatModelRequest,
  ChatModelStatus,
  ChatModelUsage,
} from "../../domain/chat-model.types.js";
import { parseOllamaNdjson } from "./ollama-stream.parser.js";
import { OllamaShowResponseSchema, type OllamaChatResponse } from "./ollama.schemas.js";

interface RequestContext {
  readonly signal: AbortSignal;
  didTimeout(): boolean;
  dispose(): void;
}

@Injectable()
export class OllamaChatModelAdapter implements ChatModelPort {
  public constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
  ) {}

  public async getStatus(signal?: AbortSignal): Promise<ChatModelStatus> {
    const model = this.config.ollama.model;
    if (model === undefined) {
      return {
        status: "not_configured",
        model: null,
        latencyMs: null,
        message: "ARC_OLLAMA_MODEL is not configured.",
      };
    }

    const startedAt = performance.now();
    const requestContext = this.createRequestContext(this.config.ollama.readinessTimeoutMs, signal);

    try {
      const response = await this.fetchOllama(
        "api/show",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ model }),
        },
        requestContext,
        signal,
      );
      const latencyMs = Math.round(performance.now() - startedAt);

      if (response.status === 404) {
        return {
          status: "model_missing",
          model,
          latencyMs,
          message: `The configured Ollama model '${model}' is not installed.`,
        };
      }

      if (!response.ok) {
        return {
          status: "error",
          model,
          latencyMs,
          message: `Ollama returned HTTP ${String(response.status)} while checking the model.`,
        };
      }

      const metadata = await this.parseJson(response);
      const parsedMetadata = OllamaShowResponseSchema.safeParse(metadata);
      if (!parsedMetadata.success) {
        return {
          status: "error",
          model,
          latencyMs,
          message: "Ollama returned invalid model metadata.",
        };
      }

      return {
        status: "ready",
        model,
        latencyMs,
      };
    } catch (error) {
      const normalizedError = this.toChatModelError(error, requestContext, signal);
      const latencyMs = Math.round(performance.now() - startedAt);
      const status =
        normalizedError.code === "OLLAMA_UNREACHABLE" || normalizedError.code === "OLLAMA_TIMEOUT"
          ? "unreachable"
          : "error";

      this.logger.warn("Ollama readiness check failed", {
        code: normalizedError.code,
        latencyMs,
        model,
      });

      return {
        status,
        model,
        latencyMs,
        message: normalizedError.message,
      };
    } finally {
      requestContext.dispose();
    }
  }

  public async *streamChat(
    request: ChatModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatModelEvent> {
    const model = this.getConfiguredModel();
    if (request.messages.length === 0) {
      throw new ChatModelError(
        "OLLAMA_REQUEST_FAILED",
        "A chat request requires at least one message.",
      );
    }

    const requestContext = this.createRequestContext(this.config.ollama.requestTimeoutMs, signal);

    try {
      const response = await this.fetchOllama(
        "api/chat",
        {
          method: "POST",
          headers: {
            accept: "application/x-ndjson",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: request.messages,
            stream: true,
          }),
        },
        requestContext,
        signal,
      );

      if (response.status === 404) {
        throw new ChatModelError(
          "OLLAMA_MODEL_NOT_FOUND",
          `The configured Ollama model '${model}' is not installed.`,
        );
      }

      if (!response.ok) {
        throw new ChatModelError(
          "OLLAMA_REQUEST_FAILED",
          `Ollama returned HTTP ${String(response.status)} while generating a response.`,
        );
      }

      if (response.body === null) {
        throw new ChatModelError(
          "OLLAMA_PROTOCOL_ERROR",
          "Ollama returned a response without a body.",
        );
      }

      let completed = false;

      for await (const record of parseOllamaNdjson(response.body)) {
        if (record.kind === "error") {
          throw new ChatModelError("OLLAMA_REQUEST_FAILED", record.message);
        }

        const content = record.response.message.content;
        if (content.length > 0) {
          yield {
            type: "delta",
            content,
          };
        }

        if (record.response.done) {
          completed = true;
          yield this.toCompletedEvent(record.response);
          break;
        }
      }

      if (!completed) {
        throw new ChatModelError(
          "OLLAMA_PROTOCOL_ERROR",
          "Ollama ended the stream without a completion record.",
        );
      }
    } catch (error) {
      throw this.toChatModelError(error, requestContext, signal);
    } finally {
      requestContext.dispose();
    }
  }

  private getConfiguredModel(): string {
    const model = this.config.ollama.model;
    if (model === undefined) {
      throw new ChatModelError("OLLAMA_NOT_CONFIGURED", "ARC_OLLAMA_MODEL is not configured.");
    }

    return model;
  }

  private createRequestContext(timeoutMs: number, callerSignal?: AbortSignal): RequestContext {
    const controller = new AbortController();
    let didTimeout = false;

    const abortFromCaller = (): void => {
      controller.abort(callerSignal?.reason);
    };

    if (callerSignal?.aborted) {
      abortFromCaller();
    } else {
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    const timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    return {
      signal: controller.signal,
      didTimeout: (): boolean => didTimeout,
      dispose: (): void => {
        clearTimeout(timeout);
        callerSignal?.removeEventListener("abort", abortFromCaller);
      },
    };
  }

  private async fetchOllama(
    path: string,
    init: RequestInit,
    requestContext: RequestContext,
    callerSignal?: AbortSignal,
  ): Promise<Response> {
    if (requestContext.signal.aborted) {
      throw this.toChatModelError(undefined, requestContext, callerSignal);
    }

    try {
      return await globalThis.fetch(this.buildUrl(path), {
        ...init,
        signal: requestContext.signal,
      });
    } catch (error) {
      throw this.toChatModelError(error, requestContext, callerSignal);
    }
  }

  private buildUrl(path: string): URL {
    return new URL(path, `${this.config.ollama.baseUrl}/`);
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new ChatModelError("OLLAMA_PROTOCOL_ERROR", "Ollama returned invalid JSON.", {
        cause: error,
      });
    }
  }

  private toCompletedEvent(response: OllamaChatResponse): ChatModelEvent {
    const usage = this.toUsage(response);

    return {
      type: "completed",
      ...(response.done_reason === undefined ? {} : { finishReason: response.done_reason }),
      ...(usage === undefined ? {} : { usage }),
    };
  }

  private toUsage(response: OllamaChatResponse): ChatModelUsage | undefined {
    if (
      response.eval_count === undefined &&
      response.prompt_eval_count === undefined &&
      response.total_duration === undefined
    ) {
      return undefined;
    }

    return {
      ...(response.prompt_eval_count === undefined
        ? {}
        : { promptTokens: response.prompt_eval_count }),
      ...(response.eval_count === undefined ? {} : { completionTokens: response.eval_count }),
      ...(response.total_duration === undefined
        ? {}
        : { totalDurationMs: response.total_duration / 1_000_000 }),
    };
  }

  private toChatModelError(
    error: unknown,
    requestContext: RequestContext,
    callerSignal?: AbortSignal,
  ): ChatModelError {
    if (error instanceof ChatModelError) {
      return error;
    }

    if (callerSignal?.aborted) {
      return new ChatModelError("GENERATION_CANCELLED", "The Ollama request was cancelled.", {
        cause: error,
      });
    }

    if (requestContext.didTimeout()) {
      return new ChatModelError(
        "OLLAMA_TIMEOUT",
        "Ollama did not respond before the configured timeout.",
        { cause: error },
      );
    }

    return new ChatModelError("OLLAMA_UNREACHABLE", "Unable to connect to Ollama.", {
      cause: error,
    });
  }
}
