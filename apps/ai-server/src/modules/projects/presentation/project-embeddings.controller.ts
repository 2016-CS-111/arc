import {
  LatestProjectEmbeddingIndexResponseSchema,
  ProjectEmbeddingIndexSchema,
  ProjectIdSchema,
  type LatestProjectEmbeddingIndexResponse,
  type ProjectEmbeddingIndex,
} from "@arc/contracts";
import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

import { ProjectEmbeddingIndexService } from "../application/project-embedding-index.service.js";
import {
  ProjectEmbeddingIndexAlreadyRunningError,
  ProjectEmbeddingIndexFailedError,
  ProjectEmbeddingProviderUnavailableError,
  ProjectEmbeddingUpstreamCatalogRequiredError,
  ProjectEmbeddingUpstreamCatalogStaleError,
  ProjectNotFoundError,
} from "../domain/project.errors.js";

@Controller("projects")
export class ProjectEmbeddingsController {
  public constructor(
    @Inject(ProjectEmbeddingIndexService)
    private readonly embeddingIndexService: ProjectEmbeddingIndexService,
  ) {}

  @Post(":projectId/embeddings/index")
  public async index(@Param("projectId") projectIdValue: unknown): Promise<ProjectEmbeddingIndex> {
    const projectId = this.parseProjectId(projectIdValue);
    try {
      return ProjectEmbeddingIndexSchema.parse(await this.embeddingIndexService.index(projectId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get(":projectId/embeddings/index")
  public async getLatest(@Param("projectId") projectIdValue: unknown): Promise<LatestProjectEmbeddingIndexResponse> {
    const projectId = this.parseProjectId(projectIdValue);
    try {
      return LatestProjectEmbeddingIndexResponseSchema.parse(await this.embeddingIndexService.getLatest(projectId));
    } catch (error) {
      this.mapError(error);
    }
  }

  private parseProjectId(value: unknown): string {
    const parsed = ProjectIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc project identifier is invalid.");
    }
    return parsed.data;
  }

  private mapError(error: unknown): never {
    if (error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (
      error instanceof ProjectEmbeddingUpstreamCatalogRequiredError ||
      error instanceof ProjectEmbeddingUpstreamCatalogStaleError ||
      error instanceof ProjectEmbeddingIndexAlreadyRunningError
    ) {
      throw new ConflictException(error.message);
    }
    if (
      error instanceof ProjectEmbeddingProviderUnavailableError ||
      error instanceof ProjectEmbeddingIndexFailedError
    ) {
      throw new ServiceUnavailableException(error.message);
    }
    throw error;
  }
}
