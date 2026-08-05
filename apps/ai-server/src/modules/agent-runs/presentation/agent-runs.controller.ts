import { AgentRunCreateRequestSchema, AgentRunSchema, type AgentRun, type AgentRunCreateRequest } from "@arc/contracts";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";

import { AgentRunService } from "../application/agent-run.service.js";
import { AgentRunNotFoundError, AgentRunStateError } from "../domain/agent-run.errors.js";

@Controller("agent-runs")
export class AgentRunsController {
  public constructor(@Inject(AgentRunService) private readonly runs: AgentRunService) {}

  @Post()
  public create(@Body() payload: unknown): AgentRun {
    const request = this.parseCreate(payload);
    try {
      return AgentRunSchema.parse(this.runs.create(request.planId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get(":runId")
  public get(@Param("runId") runId: string): AgentRun {
    try {
      return AgentRunSchema.parse(this.runs.get(runId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":runId/start")
  public start(@Param("runId") runId: string): AgentRun {
    return this.transition(runId, (id) => this.runs.start(id));
  }

  @Post(":runId/resume")
  public resume(@Param("runId") runId: string): AgentRun {
    return this.transition(runId, (id) => this.runs.resume(id));
  }

  @Post(":runId/pause")
  public pause(@Param("runId") runId: string): AgentRun {
    return this.transition(runId, (id) => this.runs.pause(id));
  }

  @Post(":runId/cancel")
  public cancel(@Param("runId") runId: string): AgentRun {
    return this.transition(runId, (id) => this.runs.cancel(id));
  }

  private transition(runId: string, transition: (id: string) => AgentRun): AgentRun {
    try {
      return AgentRunSchema.parse(transition(runId));
    } catch (error) {
      this.mapError(error);
    }
  }

  private parseCreate(payload: unknown): AgentRunCreateRequest {
    const parsed = AgentRunCreateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException("Arc task run request is invalid.");
    return parsed.data;
  }

  private mapError(error: unknown): never {
    if (error instanceof AgentRunNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof AgentRunStateError) throw new ConflictException(error.message);
    throw error;
  }
}
