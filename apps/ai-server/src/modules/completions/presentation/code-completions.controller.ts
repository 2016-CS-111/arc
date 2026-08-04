import {
  CodeCompletionRequestSchema,
  CodeCompletionResponseSchema,
  CodeCompletionStatusResponseSchema,
  type CodeCompletionRequest,
  type CodeCompletionResponse,
  type CodeCompletionStatusResponse,
} from "@arc/contracts";
import { BadRequestException, Body, Controller, Get, Inject, Post, ServiceUnavailableException } from "@nestjs/common";

import { CodeCompletionService } from "../application/code-completion.service.js";

@Controller("completions")
export class CodeCompletionsController {
  public constructor(@Inject(CodeCompletionService) private readonly completions: CodeCompletionService) {}

  @Post()
  public async complete(@Body() payload: unknown): Promise<CodeCompletionResponse> {
    const request = this.parseRequest(payload);
    try {
      return CodeCompletionResponseSchema.parse(await this.completions.complete(request));
    } catch {
      throw new ServiceUnavailableException("Arc completion is unavailable.");
    }
  }

  @Get("status")
  public async getStatus(): Promise<CodeCompletionStatusResponse> {
    return CodeCompletionStatusResponseSchema.parse(await this.completions.getStatus());
  }

  private parseRequest(payload: unknown): CodeCompletionRequest {
    const parsed = CodeCompletionRequestSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException("Arc completion request is invalid.");
    return parsed.data;
  }
}
