import type {
  ProjectEmbeddingCatalogStatus,
  ProjectSemanticSearchRequest,
  ProjectSemanticSearchResponse,
  ProjectSemanticSearchResult,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { EmbeddingModelPort } from "../../embeddings/application/embedding-model.port.js";
import { EmbeddingModelError } from "../../embeddings/domain/embedding-model.errors.js";
import { EMBEDDING_MODEL } from "../../embeddings/embeddings.constants.js";
import { PROJECT_EMBEDDING_INDEX_REPOSITORY } from "../projects.constants.js";
import type { ProjectEmbeddingIndexRepository } from "../domain/project-embedding-index.types.js";
import type { ProjectSemanticSearchRecord } from "../domain/project-semantic-search.types.js";
import {
  ProjectEmbeddingCatalogRequiredError,
  ProjectEmbeddingCatalogStaleError,
  ProjectEmbeddingProviderUnavailableError,
  ProjectSemanticSearchFailedError,
} from "../domain/project.errors.js";
import { ProjectEmbeddingIndexService } from "./project-embedding-index.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";

const RRF_K = 60;
const MIN_CANDIDATE_LIMIT = 20;
const MAX_CANDIDATE_LIMIT = 200;

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
    const candidateLimit = Math.min(MAX_CANDIDATE_LIMIT, Math.max(MIN_CANDIDATE_LIMIT, request.limit * 4));

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

    let denseRecords: readonly ProjectSemanticSearchRecord[];
    let lexicalRecords: readonly ProjectSemanticSearchRecord[];
    try {
      [denseRecords, lexicalRecords] = await Promise.all([
        this.embeddingRepository.searchSemantic({
          projectId,
          embeddingIndexId: catalog.id,
          embedding: vector,
          ...(pathPrefix === undefined ? {} : { pathPrefix }),
          languages: request.languages,
          limit: candidateLimit,
        }),
        this.embeddingRepository.searchMetadata({
          projectId,
          embeddingIndexId: catalog.id,
          query: request.query,
          ...(pathPrefix === undefined ? {} : { pathPrefix }),
          languages: request.languages,
          limit: candidateLimit,
        }),
      ]);
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
      ranking: "rrf-v1",
      rrfK: RRF_K,
      candidateLimit,
      limit: request.limit,
      truncated:
        denseRecords.length > candidateLimit ||
        lexicalRecords.length > candidateLimit ||
        new Set([...denseRecords, ...lexicalRecords].map((record) => record.identityKey)).size > request.limit,
      results: fuseCandidates(denseRecords, lexicalRecords, candidateLimit, request.limit),
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

interface FusionCandidate {
  record: ProjectSemanticSearchRecord;
  denseRank: number | null;
  denseScore: number | null;
  lexicalRank: number | null;
  lexicalScore: number | null;
}

function fuseCandidates(
  denseRecords: readonly ProjectSemanticSearchRecord[],
  lexicalRecords: readonly ProjectSemanticSearchRecord[],
  candidateLimit: number,
  resultLimit: number,
): ProjectSemanticSearchResult[] {
  const candidates = new Map<string, FusionCandidate>();

  denseRecords.slice(0, candidateLimit).forEach((record, index) => {
    candidates.set(record.identityKey, {
      record,
      denseRank: index + 1,
      denseScore: record.score,
      lexicalRank: null,
      lexicalScore: null,
    });
  });
  lexicalRecords.slice(0, candidateLimit).forEach((record, index) => {
    const candidate = candidates.get(record.identityKey);
    if (candidate === undefined) {
      candidates.set(record.identityKey, {
        record,
        denseRank: null,
        denseScore: null,
        lexicalRank: index + 1,
        lexicalScore: record.score,
      });
      return;
    }
    candidate.lexicalRank = index + 1;
    candidate.lexicalScore = record.score;
  });

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate.record,
      denseRank: candidate.denseRank,
      denseScore: candidate.denseScore,
      lexicalRank: candidate.lexicalRank,
      lexicalScore: candidate.lexicalScore,
      score:
        (candidate.denseRank === null ? 0 : 1 / (RRF_K + candidate.denseRank)) +
        (candidate.lexicalRank === null ? 0 : 1 / (RRF_K + candidate.lexicalRank)),
    }))
    .sort(compareCandidates)
    .slice(0, resultLimit)
    .map((record, index) => ({ ...record, rank: index + 1 }));
}

function compareCandidates(
  left: Omit<ProjectSemanticSearchResult, "rank">,
  right: Omit<ProjectSemanticSearchResult, "rank">,
) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.path !== right.path) {
    return left.path < right.path ? -1 : 1;
  }
  if (left.range.startByte !== right.range.startByte) {
    return left.range.startByte - right.range.startByte;
  }
  return left.chunkId < right.chunkId ? -1 : left.chunkId === right.chunkId ? 0 : 1;
}
