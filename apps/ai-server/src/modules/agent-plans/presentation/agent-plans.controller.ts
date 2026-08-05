import {
  AgentPlanCreateRequestSchema,
  AgentPlanSchema,
  AgentPlanUpdateRequestSchema,
  type AgentPlan,
  type AgentPlanCreateRequest,
  type AgentPlanUpdateRequest,
} from "@arc/contracts";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

import { AgentPlanGenerationService } from "../application/agent-plan-generation.service.js";
import { AgentPlanService } from "../application/agent-plan.service.js";
import { AgentPlanConflictError, AgentPlanNotFoundError } from "../domain/agent-plan.errors.js";

@Controller("agent-plans")
export class AgentPlansController {
  public constructor(
    @Inject(AgentPlanGenerationService) private readonly generation: AgentPlanGenerationService,
    @Inject(AgentPlanService) private readonly plans: AgentPlanService,
  ) {}

  @Post()
  public async create(@Body() payload: unknown): Promise<AgentPlan> {
    const request = this.parseCreate(payload);
    try {
      return AgentPlanSchema.parse(await this.generation.create(request, new AbortController().signal));
    } catch (error) {
      this.mapError(error, true);
    }
  }

  @Get(":planId")
  public get(@Param("planId") planId: string): AgentPlan {
    try {
      return AgentPlanSchema.parse(this.plans.get(planId));
    } catch (error) {
      this.mapError(error, false);
    }
  }

  @Patch(":planId")
  public update(@Param("planId") planId: string, @Body() payload: unknown): AgentPlan {
    const request = this.parseUpdate(payload);
    try {
      return AgentPlanSchema.parse(this.plans.update(planId, request));
    } catch (error) {
      this.mapError(error, false);
    }
  }

  private parseCreate(payload: unknown): AgentPlanCreateRequest {
    const parsed = AgentPlanCreateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException("Arc task plan request is invalid.");
    return parsed.data;
  }

  private parseUpdate(payload: unknown): AgentPlanUpdateRequest {
    const parsed = AgentPlanUpdateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException("Arc task plan update is invalid.");
    return parsed.data;
  }

  private mapError(error: unknown, generation: boolean): never {
    if (error instanceof AgentPlanNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof AgentPlanConflictError) throw new ConflictException(error.message);
    if (generation) throw new ServiceUnavailableException("Arc could not create a task plan.");
    throw error;
  }
}
