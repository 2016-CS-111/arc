import {
  ProjectIdSchema,
  ProjectIntelligenceCatalogQuerySchema,
  ProjectIntelligenceCatalogResponseSchema,
  type ProjectIntelligenceCatalogQuery,
  type ProjectIntelligenceCatalogResponse,
} from "@arc/contracts";
import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";

import { ProjectIntelligenceService } from "../application/project-intelligence.service.js";
import {
  ProjectIntelligenceCatalogQueryFailedError,
  ProjectIntelligenceCatalogRequiredError,
  ProjectIntelligenceCatalogStaleError,
  ProjectNotFoundError,
} from "../domain/project.errors.js";

@Controller("projects")
export class ProjectIntelligenceController {
  public constructor(@Inject(ProjectIntelligenceService) private readonly intelligence: ProjectIntelligenceService) {}

  @Get(":projectId/intelligence/catalog")
  public async getCatalog(
    @Param("projectId") projectIdValue: unknown,
    @Query() queryValue: unknown,
  ): Promise<ProjectIntelligenceCatalogResponse> {
    const projectId = this.parseProjectId(projectIdValue);
    const query = this.parseQuery(queryValue);
    try {
      return ProjectIntelligenceCatalogResponseSchema.parse(await this.intelligence.getCatalog(projectId, query));
    } catch (error) {
      if (error instanceof ProjectNotFoundError) throw new NotFoundException(error.message);
      if (
        error instanceof ProjectIntelligenceCatalogRequiredError ||
        error instanceof ProjectIntelligenceCatalogStaleError
      ) {
        throw new ConflictException(error.message);
      }
      if (error instanceof ProjectIntelligenceCatalogQueryFailedError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  private parseProjectId(value: unknown): string {
    const parsed = ProjectIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException("Arc project identifier is invalid.");
    return parsed.data;
  }

  private parseQuery(value: unknown): ProjectIntelligenceCatalogQuery {
    const parsed = ProjectIntelligenceCatalogQuerySchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException("Arc project intelligence query is invalid.");
    return parsed.data;
  }
}
