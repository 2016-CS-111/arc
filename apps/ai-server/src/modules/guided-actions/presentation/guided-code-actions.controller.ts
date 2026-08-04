import {
  GuidedCodeActionRequestSchema,
  GuidedCodeActionResponseSchema,
  type GuidedCodeActionRequest,
  type GuidedCodeActionResponse,
} from "@arc/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

import { GuidedCodeActionService } from "../application/guided-code-action.service.js";

@Controller("guided-actions")
export class GuidedCodeActionsController {
  public constructor(@Inject(GuidedCodeActionService) private readonly actions: GuidedCodeActionService) {}

  @Post()
  public async execute(@Body() payload: unknown): Promise<GuidedCodeActionResponse> {
    const request = this.parseRequest(payload);
    try {
      return GuidedCodeActionResponseSchema.parse(await this.actions.execute(request));
    } catch {
      throw new ServiceUnavailableException("Arc could not prepare this editor action.");
    }
  }

  @Post(":requestId/cancel")
  public cancel(@Param("requestId") requestId: string): { readonly cancelled: true } {
    this.actions.cancel(requestId);
    return { cancelled: true };
  }

  private parseRequest(payload: unknown): GuidedCodeActionRequest {
    const parsed = GuidedCodeActionRequestSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException("Arc editor action request is invalid.");
    return parsed.data;
  }
}
