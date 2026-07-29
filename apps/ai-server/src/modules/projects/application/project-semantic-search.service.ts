import type {
  ProjectEmbeddingCatalogStatus,
  ProjectSemanticSearchRequest,
  ProjectSemanticSearchResponse,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { EmbeddingModelPort } from "../../embeddings/application/embedding-model.port.js";
import { EmbeddingModelError } from "../../embeddings/domain/embedding-model.errors.js";
import { EMBEDDING_MODEL } from "../../embeddings/embeddings.constants.js";
import { PROJECT_EMBEDDING_INDEX_REPOSITORY } from "../projects.constants.js";
import type { ProjectEmbeddingIndexRepository } from "../domain/project-embedding-index.types.js";
import {
  ProjectEmbeddingCatalogRequiredError,
  ProjectEmbeddingCatalogStaleError,
  ProjectEmbeddingProviderUnavailableError,
  ProjectSemanticSearchFailedError,
} from "../domain/project.errors.js";
import { ProjectEmbeddingIndexService } from "./project-embedding-index.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";

@Injectable()
export class ProjectSemanticSearchService {
  public constructor(
    @Inject(ProjectEmbeddingIndexService)
    private readonly embeddingIndexService: ProjectEmbeddingIndexService,
    @Inject(PROJECT_EMBEDDING_INDEX_REPOSITORY)
    private readonly embeddingRepository: ProjectEmbeddingIndexRepository,
    @Inject(EMBEDDING_MODEL)
    private readonly embeddingModel: EmbeddingModelPort,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
  ) {}

  public async search(
    projectId: string,
    request: ProjectSemanticSearchRequest,
  ): Promise<ProjectSemanticSearchResponse> {
    const catalog = await this.getFreshCatalog(projectId);
    const pathPrefix = request.pathPrefix === undefined ? undefined : this.pathNormalizer.normalize(request.pathPrefix);

    let vector: readonly number[];
    try {
      const result = await this.embeddingModel.embed({
        purpose: "query",
        inputs: [request.query],
      });
      if (
        result.model !== catalog.model ||
        result.dimensions !== catalog.dimensions ||
        result.vectors[0] === undefined
      ) {
        throw new ProjectSemanticSearchFailedError();
      }
      vector = result.vectors[0];
    } catch (error) {
      if (error instanceof ProjectSemanticSearchFailedError) {
        throw error;
      }
      if (error instanceof EmbeddingModelError) {
        throw new ProjectEmbeddingProviderUnavailableError();
      }
      throw new ProjectSemanticSearchFailedError();
    }

    let records;
    try {
      records = await this.embeddingRepository.searchSemantic({
        projectId,
        embeddingIndexId: catalog.id,
        embedding: vector,
        ...(pathPrefix === undefined ? {} : { pathPrefix }),
        languages: request.languages,
        limit: request.limit,
      });
    } catch {
      throw new ProjectSemanticSearchFailedError();
    }

    const latestCatalog = await this.getFreshCatalog(projectId);
    if (latestCatalog.id !== catalog.id) {
      throw new ProjectEmbeddingCatalogStaleError(projectId);
    }

    return {
      projectId,
      embeddingIndexId: catalog.id,
      sourceIndexRunId: catalog.sourceIndexRunId,
      symbolIndexRunId: catalog.symbolIndexRunId,
      dependencyIndexRunId: catalog.dependencyIndexRunId,
      frameworkIndexRunId: catalog.frameworkIndexRunId,
      model: catalog.model,
      dimensions: catalog.dimensions,
      catalogLimited: catalog.status === "limited",
      limit: request.limit,
      truncated: records.length > request.limit,
      results: records.slice(0, request.limit).map((record, index) => ({
        ...record,
        rank: index + 1,
      })),
    };
  }

  private async getFreshCatalog(projectId: string): Promise<ProjectEmbeddingCatalogStatus> {
    const status = await this.embeddingIndexService.getLatest(projectId);
    if (status.currentCatalog === null) {
      throw new ProjectEmbeddingCatalogRequiredError(projectId);
    }
    if (status.currentCatalog.stale) {
      throw new ProjectEmbeddingCatalogStaleError(projectId);
    }
    return status.currentCatalog;
  }
}
