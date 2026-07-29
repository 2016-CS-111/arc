import {
  ProjectIdSchema,
  ProjectSemanticSearchRequestSchema,
  ProjectSemanticSearchResponseSchema,
  type ProjectSemanticSearchRequest,
  type ProjectSemanticSearchResponse,
} from "@arc/contracts";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";

import { ProjectSemanticSearchService } from "../application/project-semantic-search.service.js";
import {
  InvalidProjectPathError,
  ProjectEmbeddingCatalogRequiredError,
  ProjectEmbeddingCatalogStaleError,
  ProjectEmbeddingProviderUnavailableError,
  ProjectNotFoundError,
  ProjectSemanticSearchFailedError,
} from "../domain/project.errors.js";

@Controller("projects")
export class ProjectSemanticSearchController {
  public constructor(
    @Inject(ProjectSemanticSearchService)
    private readonly semanticSearchService: ProjectSemanticSearchService,
  ) {}

  @Post(":projectId/embeddings/search")
  public async search(
    @Param("projectId") projectIdValue: unknown,
    @Body() body: unknown,
  ): Promise<ProjectSemanticSearchResponse> {
    const projectId = this.parseProjectId(projectIdValue);
    const request = this.parseRequest(body);

    try {
      return ProjectSemanticSearchResponseSchema.parse(await this.semanticSearchService.search(projectId, request));
    } catch (error) {
      if (error instanceof InvalidProjectPathError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof ProjectNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ProjectEmbeddingCatalogRequiredError || error instanceof ProjectEmbeddingCatalogStaleError) {
        throw new ConflictException(error.message);
      }
      if (
        error instanceof ProjectEmbeddingProviderUnavailableError ||
        error instanceof ProjectSemanticSearchFailedError
      ) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  private parseProjectId(value: unknown): string {
    const parsed = ProjectIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc project identifier is invalid.");
    }
    return parsed.data;
  }

  private parseRequest(value: unknown): ProjectSemanticSearchRequest {
    const parsed = ProjectSemanticSearchRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc semantic search request is invalid.");
    }
    return parsed.data;
  }
}
