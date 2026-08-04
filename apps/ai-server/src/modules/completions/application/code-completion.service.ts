import {
  CodeCompletionResponseSchema,
  CodeCompletionStatusResponseSchema,
  type CodeCompletionRequest,
  type CodeCompletionResponse,
  type CodeCompletionStatusResponse,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import type { CodeCompletionModelPort } from "../../inference/application/code-completion-model.port.js";
import { CODE_COMPLETION_MODEL } from "../../inference/inference.constants.js";

@Injectable()
export class CodeCompletionService {
  public constructor(
    @Inject(CODE_COMPLETION_MODEL) private readonly model: CodeCompletionModelPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async complete(input: CodeCompletionRequest, signal?: AbortSignal): Promise<CodeCompletionResponse> {
    const result = await this.model.complete(
      {
        language: input.language,
        maxTokens: Math.min(input.maxTokens, this.config.completion.maxTokens),
        prefix: input.prefix,
        suffix: input.suffix,
      },
      signal,
    );
    return CodeCompletionResponseSchema.parse({
      completion: normalizeCompletion(result.completion, input.suffix),
      latencyMs: result.latencyMs,
      model: result.model,
    });
  }

  public async getStatus(signal?: AbortSignal): Promise<CodeCompletionStatusResponse> {
    return CodeCompletionStatusResponseSchema.parse(await this.model.getStatus(signal));
  }
}

function normalizeCompletion(value: string, suffix: string): string {
  const completion = value
    .replaceAll("<|fim_prefix|>", "")
    .replaceAll("<|fim_suffix|>", "")
    .replaceAll("<|fim_middle|>", "");
  const suffixOffset = suffix.length === 0 ? -1 : completion.indexOf(suffix);
  return (suffixOffset === -1 ? completion : completion.slice(0, suffixOffset)).slice(0, 8_192);
}
