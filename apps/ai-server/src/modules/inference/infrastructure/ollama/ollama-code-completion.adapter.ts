import { APP_CONFIG } from "../../../../config/config.constants.js";
import type { AppConfig } from "../../../../config/env.js";
import { ARC_LOGGER } from "../../../logger/logger.constants.js";
import type { Logger } from "@arc/shared";
import { Inject, Injectable } from "@nestjs/common";

import type { CodeCompletionModelPort } from "../../application/code-completion-model.port.js";
import { CodeCompletionError } from "../../domain/code-completion.errors.js";
import type {
  CodeCompletionModelRequest,
  CodeCompletionModelResponse,
  CodeCompletionModelStatus,
} from "../../domain/code-completion.types.js";
import { OllamaGenerateResponseSchema, OllamaShowResponseSchema } from "./ollama.schemas.js";

interface RequestContext {
  readonly signal: AbortSignal;
  didTimeout(): boolean;
  dispose(): void;
}

@Injectable()
export class OllamaCodeCompletionAdapter implements CodeCompletionModelPort {
  public constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
  ) {}

  public async getStatus(signal?: AbortSignal): Promise<CodeCompletionModelStatus> {
    const model = this.config.ollama.model;
    if (model === undefined) {
      return {
        latencyMs: null,
        model: null,
        status: "not_configured",
        supportsFillInMiddle: false,
        message: "ARC_OLLAMA_MODEL is not configured.",
      };
    }

    const startedAt = performance.now();
    const context = this.createRequestContext(this.config.ollama.readinessTimeoutMs, signal);
    try {
      const response = await this.fetchOllama(
        "api/show",
        { body: JSON.stringify({ model }), headers: { "content-type": "application/json" }, method: "POST" },
        context,
        signal,
      );
      const latencyMs = Math.round(performance.now() - startedAt);
      if (response.status === 404) {
        return { latencyMs, model, status: "model_missing", supportsFillInMiddle: false };
      }
      if (!response.ok) {
        return {
          latencyMs,
          model,
          status: "error",
          supportsFillInMiddle: false,
          message: `Ollama returned HTTP ${String(response.status)} while checking completion support.`,
        };
      }
      const parsed = OllamaShowResponseSchema.safeParse(await this.parseJson(response));
      if (!parsed.success) {
        return {
          latencyMs,
          model,
          status: "error",
          supportsFillInMiddle: false,
          message: "Ollama returned invalid model metadata.",
        };
      }
      const supportsFillInMiddle = parsed.data.capabilities?.includes("completion") ?? false;
      return {
        latencyMs,
        model,
        status: supportsFillInMiddle ? "ready" : "unsupported",
        supportsFillInMiddle,
        ...(supportsFillInMiddle
          ? {}
          : { message: "The configured Ollama model does not advertise completion support." }),
      };
    } catch (error) {
      const normalized = this.toError(error, context, signal);
      const status =
        normalized.code === "OLLAMA_UNREACHABLE" || normalized.code === "OLLAMA_TIMEOUT" ? "unreachable" : "error";
      return {
        latencyMs: Math.round(performance.now() - startedAt),
        model,
        status,
        supportsFillInMiddle: false,
        message: normalized.message,
      };
    } finally {
      context.dispose();
    }
  }

  public async complete(
    request: CodeCompletionModelRequest,
    signal?: AbortSignal,
  ): Promise<CodeCompletionModelResponse> {
    const model = this.getConfiguredModel();
    const startedAt = performance.now();
    const context = this.createRequestContext(this.config.completion.requestTimeoutMs, signal);
    try {
      const response = await this.fetchOllama(
        "api/generate",
        {
          body: JSON.stringify({
            model,
            options: {
              num_predict: Math.min(request.maxTokens, this.config.completion.maxTokens),
              temperature: 0.15,
            },
            prompt: request.prefix,
            stream: false,
            suffix: request.suffix,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
        context,
        signal,
      );
      if (response.status === 404) {
        throw new CodeCompletionError(
          "OLLAMA_MODEL_NOT_FOUND",
          `The configured Ollama model '${model}' is not installed.`,
        );
      }
      if (!response.ok) {
        throw new CodeCompletionError(
          "OLLAMA_REQUEST_FAILED",
          `Ollama returned HTTP ${String(response.status)} while generating a completion.`,
        );
      }
      const parsed = OllamaGenerateResponseSchema.safeParse(await this.parseJson(response));
      if (!parsed.success || !parsed.data.done) {
        throw new CodeCompletionError("OLLAMA_PROTOCOL_ERROR", "Ollama returned an invalid completion response.");
      }
      return {
        completion: parsed.data.response,
        latencyMs: Math.round(performance.now() - startedAt),
        model: parsed.data.model,
      };
    } catch (error) {
      const normalized = this.toError(error, context, signal);
      this.logger.warn("Ollama completion request failed", { code: normalized.code, model });
      throw normalized;
    } finally {
      context.dispose();
    }
  }

  private getConfiguredModel(): string {
    const model = this.config.ollama.model;
    if (model === undefined)
      throw new CodeCompletionError("OLLAMA_NOT_CONFIGURED", "ARC_OLLAMA_MODEL is not configured.");
    return model;
  }

  private createRequestContext(timeoutMs: number, callerSignal?: AbortSignal): RequestContext {
    const controller = new AbortController();
    let didTimeout = false;
    const abortFromCaller = (): void => {
      controller.abort(callerSignal?.reason);
    };
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
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
    context: RequestContext,
    callerSignal?: AbortSignal,
  ): Promise<Response> {
    if (context.signal.aborted) throw this.toError(undefined, context, callerSignal);
    try {
      return await globalThis.fetch(new URL(path, `${this.config.ollama.baseUrl}/`), {
        ...init,
        signal: context.signal,
      });
    } catch (error) {
      throw this.toError(error, context, callerSignal);
    }
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new CodeCompletionError("OLLAMA_PROTOCOL_ERROR", "Ollama returned invalid JSON.", { cause: error });
    }
  }

  private toError(error: unknown, context: RequestContext, callerSignal?: AbortSignal): CodeCompletionError {
    if (error instanceof CodeCompletionError) return error;
    if (callerSignal?.aborted) return new CodeCompletionError("COMPLETION_CANCELLED", "Arc completion was cancelled.");
    if (context.didTimeout()) return new CodeCompletionError("OLLAMA_TIMEOUT", "Ollama completion request timed out.");
    if (context.signal.aborted) return new CodeCompletionError("COMPLETION_CANCELLED", "Arc completion was cancelled.");
    return new CodeCompletionError("OLLAMA_UNREACHABLE", "Arc could not reach Ollama for completion.", {
      cause: error,
    });
  }
}
