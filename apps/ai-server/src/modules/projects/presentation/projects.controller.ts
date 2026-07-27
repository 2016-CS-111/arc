import {
  CheckProjectPathRequestSchema,
  LatestProjectScanResponseSchema,
  LatestProjectSourceIndexResponseSchema,
  ProjectIdSchema,
  RegisterProjectRequestSchema,
  type CheckProjectPathRequest,
  type LatestProjectScanResponse,
  type LatestProjectSourceIndexResponse,
  type ProjectIgnoreDecision,
  type ProjectScan,
  type ProjectSourceIndex,
  type RegisterProjectRequest,
  type RegisterProjectResponse,
} from "@arc/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { ProjectIgnorePolicyService } from "../application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "../application/project-inventory.service.js";
import { ProjectRegistrationService } from "../application/project-registration.service.js";
import { ProjectSourceIndexService } from "../application/project-source-index.service.js";
import {
  IgnoreRulesFileTooLargeError,
  InvalidProjectPathError,
  InvalidProjectRootError,
  ProjectNotFoundError,
  ProjectScanAlreadyRunningError,
  ProjectScanFailedError,
  ProjectInventoryRequiredError,
  ProjectSourceIndexAlreadyRunningError,
  ProjectSourceIndexFailedError,
} from "../domain/project.errors.js";

@Controller("projects")
export class ProjectsController {
  public constructor(
    @Inject(ProjectRegistrationService)
    private readonly projectRegistrationService: ProjectRegistrationService,
    @Inject(ProjectIgnorePolicyService)
    private readonly projectIgnorePolicyService: ProjectIgnorePolicyService,
    @Inject(ProjectInventoryService)
    private readonly projectInventoryService: ProjectInventoryService,
    @Inject(ProjectSourceIndexService)
    private readonly projectSourceIndexService: ProjectSourceIndexService,
  ) {}

  @Post("register")
  public async register(@Body() payload: unknown): Promise<RegisterProjectResponse> {
    const request = this.parseRequest(payload);

    try {
      return await this.projectRegistrationService.register(request);
    } catch (error) {
      if (error instanceof InvalidProjectRootError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  @Post(":projectId/sources/index")
  public async indexSources(@Param("projectId") projectIdValue: unknown): Promise<ProjectSourceIndex> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return await this.projectSourceIndexService.index(projectId);
    } catch (error) {
      this.mapSourceIndexError(error);
    }
  }

  @Get(":projectId/sources/index")
  public async getLatestSourceIndex(
    @Param("projectId") projectIdValue: unknown,
  ): Promise<LatestProjectSourceIndexResponse> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return LatestProjectSourceIndexResponseSchema.parse(await this.projectSourceIndexService.getLatest(projectId));
    } catch (error) {
      this.mapSourceIndexError(error);
    }
  }

  @Post(":projectId/inventory/scan")
  public async scanInventory(@Param("projectId") projectIdValue: unknown): Promise<ProjectScan> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return await this.projectInventoryService.scan(projectId);
    } catch (error) {
      this.mapInventoryError(error);
    }
  }

  @Get(":projectId/inventory/scan")
  public async getLatestInventoryScan(@Param("projectId") projectIdValue: unknown): Promise<LatestProjectScanResponse> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return LatestProjectScanResponseSchema.parse(await this.projectInventoryService.getLatestScan(projectId));
    } catch (error) {
      this.mapInventoryError(error);
    }
  }

  @Post(":projectId/ignore/check")
  public async checkIgnore(
    @Param("projectId") projectIdValue: unknown,
    @Body() payload: unknown,
  ): Promise<ProjectIgnoreDecision> {
    const projectId = this.parseProjectId(projectIdValue);
    const request = this.parseIgnoreRequest(payload);

    try {
      return await this.projectIgnorePolicyService.check(projectId, request);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InvalidProjectPathError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof IgnoreRulesFileTooLargeError) {
        throw new UnprocessableEntityException(error.message);
      }

      throw error;
    }
  }

  private parseRequest(payload: unknown): RegisterProjectRequest {
    const parsed = RegisterProjectRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException("Arc project registration request is invalid.");
    }

    return parsed.data;
  }

  private parseProjectId(value: unknown): string {
    const parsed = ProjectIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc project identifier is invalid.");
    }

    return parsed.data;
  }

  private parseIgnoreRequest(payload: unknown): CheckProjectPathRequest {
    const parsed = CheckProjectPathRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException("Arc project ignore request is invalid.");
    }

    return parsed.data;
  }

  private mapInventoryError(error: unknown): never {
    if (error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof ProjectScanAlreadyRunningError) {
      throw new ConflictException(error.message);
    }
    if (error instanceof ProjectScanFailedError) {
      throw new ServiceUnavailableException(error.message);
    }

    throw error;
  }

  private mapSourceIndexError(error: unknown): never {
    if (error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof ProjectInventoryRequiredError || error instanceof ProjectSourceIndexAlreadyRunningError) {
      throw new ConflictException(error.message);
    }
    if (error instanceof ProjectSourceIndexFailedError) {
      throw new ServiceUnavailableException(error.message);
    }

    throw error;
  }
}
