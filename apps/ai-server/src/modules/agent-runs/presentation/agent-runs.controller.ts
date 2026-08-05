import {
  AgentRunCreateRequestSchema,
  AgentRunReportSchema,
  AgentRunSchema,
  type AgentRun,
  type AgentRunCreateRequest,
  type AgentRunReport,
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
  Post,
} from "@nestjs/common";

import { AgentRunService } from "../application/agent-run.service.js";
import { AgentRunNotFoundError, AgentRunStateError } from "../domain/agent-run.errors.js";

@Controller("agent-runs")
export class AgentRunsController {
  public constructor(@Inject(AgentRunService) private readonly runs: AgentRunService) {}

  @Post()
  public async create(@Body() payload: unknown): Promise<AgentRun> {
    const request = this.parseCreate(payload);
    try {
      return AgentRunSchema.parse(await this.runs.create(request.planId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get(":runId/report")
  public report(@Param("runId") runId: string): AgentRunReport {
    try {
      return AgentRunReportSchema.parse(this.runs.report(runId));
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
  public start(@Param("runId") runId: string): Promise<AgentRun> {
    return this.transition(runId, (id) => this.runs.start(id));
  }

  @Post(":runId/resume")
  public resume(@Param("runId") runId: string): Promise<AgentRun> {
    return this.transition(runId, (id) => this.runs.resume(id));
  }

  @Post(":runId/pause")
  public pause(@Param("runId") runId: string): Promise<AgentRun> {
    return this.transition(runId, (id) => this.runs.pause(id));
  }

  @Post(":runId/cancel")
  public cancel(@Param("runId") runId: string): Promise<AgentRun> {
    return this.transition(runId, (id) => this.runs.cancel(id));
  }

  private async transition(runId: string, transition: (id: string) => Promise<AgentRun>): Promise<AgentRun> {
    try {
      return AgentRunSchema.parse(await transition(runId));
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
