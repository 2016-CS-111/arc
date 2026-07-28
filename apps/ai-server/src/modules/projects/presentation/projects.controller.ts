import {
  CheckProjectPathRequestSchema,
  LatestProjectDependencyIndexResponseSchema,
  LatestProjectScanResponseSchema,
  LatestProjectSourceIndexResponseSchema,
  LatestProjectSymbolIndexResponseSchema,
  ProjectDependencyGraphQuerySchema,
  ProjectDependencyGraphResponseSchema,
  ProjectIdSchema,
  RegisterProjectRequestSchema,
  type CheckProjectPathRequest,
  type LatestProjectDependencyIndexResponse,
  type LatestProjectScanResponse,
  type LatestProjectSourceIndexResponse,
  type LatestProjectSymbolIndexResponse,
  type ProjectIgnoreDecision,
  type ProjectDependencyGraphQuery,
  type ProjectDependencyGraphResponse,
  type ProjectDependencyIndex,
  type ProjectScan,
  type ProjectSourceIndex,
  type ProjectSymbolIndex,
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
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { ProjectDependencyGraphService } from "../application/project-dependency-graph.service.js";
import { ProjectDependencyIndexService } from "../application/project-dependency-index.service.js";
import { ProjectIgnorePolicyService } from "../application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "../application/project-inventory.service.js";
import { ProjectRegistrationService } from "../application/project-registration.service.js";
import { ProjectSourceIndexService } from "../application/project-source-index.service.js";
import { ProjectSymbolIndexService } from "../application/project-symbol-index.service.js";
import {
  IgnoreRulesFileTooLargeError,
  InvalidProjectPathError,
  InvalidProjectRootError,
  ProjectDependencyCatalogRequiredError,
  ProjectDependencyCatalogStaleError,
  ProjectDependencyGraphFailedError,
  ProjectDependencyIndexAlreadyRunningError,
  ProjectDependencyIndexFailedError,
  ProjectDependencyPathNotFoundError,
  ProjectNotFoundError,
  ProjectScanAlreadyRunningError,
  ProjectScanFailedError,
  ProjectInventoryRequiredError,
  ProjectSourceIndexAlreadyRunningError,
  ProjectSourceIndexFailedError,
  ProjectSourceCatalogRequiredError,
  ProjectSourceCatalogStaleError,
  ProjectSymbolIndexAlreadyRunningError,
  ProjectSymbolIndexFailedError,
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
    @Inject(ProjectSymbolIndexService)
    private readonly projectSymbolIndexService: ProjectSymbolIndexService,
    @Inject(ProjectDependencyIndexService)
    private readonly projectDependencyIndexService: ProjectDependencyIndexService,
    @Inject(ProjectDependencyGraphService)
    private readonly projectDependencyGraphService: ProjectDependencyGraphService,
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

  @Post(":projectId/symbols/index")
  public async indexSymbols(@Param("projectId") projectIdValue: unknown): Promise<ProjectSymbolIndex> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return await this.projectSymbolIndexService.index(projectId);
    } catch (error) {
      this.mapSymbolIndexError(error);
    }
  }

  @Post(":projectId/dependencies/index")
  public async indexDependencies(@Param("projectId") projectIdValue: unknown): Promise<ProjectDependencyIndex> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return await this.projectDependencyIndexService.index(projectId);
    } catch (error) {
      this.mapDependencyIndexError(error);
    }
  }

  @Get(":projectId/dependencies/index")
  public async getLatestDependencyIndex(
    @Param("projectId") projectIdValue: unknown,
  ): Promise<LatestProjectDependencyIndexResponse> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return LatestProjectDependencyIndexResponseSchema.parse(
        await this.projectDependencyIndexService.getLatest(projectId),
      );
    } catch (error) {
      this.mapDependencyIndexError(error);
    }
  }

  @Get(":projectId/dependencies/graph")
  public async getDependencyGraph(
    @Param("projectId") projectIdValue: unknown,
    @Query() queryValue: unknown,
  ): Promise<ProjectDependencyGraphResponse> {
    const projectId = this.parseProjectId(projectIdValue);
    const query = this.parseDependencyGraphQuery(queryValue);

    try {
      return ProjectDependencyGraphResponseSchema.parse(
        await this.projectDependencyGraphService.getGraph(projectId, query),
      );
    } catch (error) {
      this.mapDependencyGraphError(error);
    }
  }

  @Get(":projectId/symbols/index")
  public async getLatestSymbolIndex(
    @Param("projectId") projectIdValue: unknown,
  ): Promise<LatestProjectSymbolIndexResponse> {
    const projectId = this.parseProjectId(projectIdValue);

    try {
      return LatestProjectSymbolIndexResponseSchema.parse(await this.projectSymbolIndexService.getLatest(projectId));
    } catch (error) {
      this.mapSymbolIndexError(error);
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

  private parseDependencyGraphQuery(payload: unknown): ProjectDependencyGraphQuery {
    const parsed = ProjectDependencyGraphQuerySchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException("Arc dependency graph query is invalid.");
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

  private mapSymbolIndexError(error: unknown): never {
    if (error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (
      error instanceof ProjectSourceCatalogRequiredError ||
      error instanceof ProjectSourceCatalogStaleError ||
      error instanceof ProjectSymbolIndexAlreadyRunningError
    ) {
      throw new ConflictException(error.message);
    }
    if (error instanceof ProjectSymbolIndexFailedError) {
      throw new ServiceUnavailableException(error.message);
    }

    throw error;
  }

  private mapDependencyIndexError(error: unknown): never {
    if (error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (
      error instanceof ProjectSourceCatalogRequiredError ||
      error instanceof ProjectSourceCatalogStaleError ||
      error instanceof ProjectDependencyIndexAlreadyRunningError
    ) {
      throw new ConflictException(error.message);
    }
    if (error instanceof ProjectDependencyIndexFailedError) {
      throw new ServiceUnavailableException(error.message);
    }

    throw error;
  }

  private mapDependencyGraphError(error: unknown): never {
    if (error instanceof InvalidProjectPathError) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof ProjectNotFoundError || error instanceof ProjectDependencyPathNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof ProjectDependencyCatalogRequiredError || error instanceof ProjectDependencyCatalogStaleError) {
      throw new ConflictException(error.message);
    }
    if (error instanceof ProjectDependencyGraphFailedError) {
      throw new ServiceUnavailableException(error.message);
    }

    throw error;
  }
}
