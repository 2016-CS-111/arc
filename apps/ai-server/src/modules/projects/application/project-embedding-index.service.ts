import type {
  LatestProjectEmbeddingIndexResponse,
  Project,
  ProjectDependencyIndex,
  ProjectEmbeddingIndex,
  ProjectEmbeddingIndexErrorCode,
  ProjectEmbeddingIndexLimitReason,
  ProjectFrameworkIndex,
  ProjectSymbolIndex,
} from "@arc/contracts";
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import type { EmbeddingModelPort } from "../../embeddings/application/embedding-model.port.js";
import { EmbeddingModelError } from "../../embeddings/domain/embedding-model.errors.js";
import { EMBEDDING_MODEL } from "../../embeddings/embeddings.constants.js";
import {
  PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  PROJECT_EMBEDDING_INDEX_REPOSITORY,
  PROJECT_FRAMEWORK_INDEX_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  PROJECT_SYMBOL_INDEX_REPOSITORY,
} from "../projects.constants.js";
import type {
  ProjectEmbeddingChunkPublication,
  ProjectEmbeddingFilePublication,
  ProjectEmbeddingIndexRepository,
  ReusableProjectEmbeddingChunk,
} from "../domain/project-embedding-index.types.js";
import {
  PROJECT_SOURCE_CHUNKER_IDENTITY,
  PROJECT_SOURCE_INPUT_FORMAT,
  type ProjectSourceChunk,
} from "../domain/project-source-chunk.types.js";
import type { ProjectSourceCatalogSnapshot, ReadyProjectSourceFile } from "../domain/project-source-index.types.js";
import type { ProjectSymbolCatalogRecord } from "../domain/project-symbol-index.types.js";
import {
  ProjectEmbeddingIndexAlreadyRunningError,
  ProjectEmbeddingIndexFailedError,
  ProjectEmbeddingProviderUnavailableError,
  ProjectEmbeddingUpstreamCatalogRequiredError,
  ProjectEmbeddingUpstreamCatalogStaleError,
  ProjectNotFoundError,
  ProjectSourceChunkError,
} from "../domain/project.errors.js";
import type { ProjectFrameworkIndexRepository } from "../domain/project-framework-index.types.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import type { ProjectRepository } from "./project.repository.js";
import { ProjectSourceChunker } from "./project-source-chunker.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";

const embeddingDimensions = 1_024;
const inputFormat = `${PROJECT_SOURCE_INPUT_FORMAT}+plain-v1`;

interface EmbeddingUpstreamSnapshot {
  readonly sourceCatalog: ProjectSourceCatalogSnapshot;
  readonly symbolRun: ProjectSymbolIndex;
  readonly dependencyRun: ProjectDependencyIndex;
  readonly frameworkRun: ProjectFrameworkIndex;
}

interface EmbeddedFiles {
  readonly files: readonly ProjectEmbeddingFilePublication[];
  readonly embeddedChunkCount: number;
  readonly reusedChunkCount: number;
  readonly limitReasons: readonly ProjectEmbeddingIndexLimitReason[];
}

@Injectable()
export class ProjectEmbeddingIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectEmbeddingIndexService.name);

  public constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY)
    private readonly sourceRepository: ProjectSourceIndexRepository,
    @Inject(PROJECT_SYMBOL_INDEX_REPOSITORY)
    private readonly symbolRepository: ProjectSymbolIndexRepository,
    @Inject(PROJECT_DEPENDENCY_INDEX_REPOSITORY)
    private readonly dependencyRepository: ProjectDependencyIndexRepository,
    @Inject(PROJECT_FRAMEWORK_INDEX_REPOSITORY)
    private readonly frameworkRepository: ProjectFrameworkIndexRepository,
    @Inject(PROJECT_EMBEDDING_INDEX_REPOSITORY)
    private readonly embeddingRepository: ProjectEmbeddingIndexRepository,
    @Inject(EMBEDDING_MODEL) private readonly embeddingModel: EmbeddingModelPort,
    @Inject(ProjectIgnorePolicyService) private readonly ignorePolicy: ProjectIgnorePolicyService,
    @Inject(ProjectSourceChunker) private readonly sourceChunker: ProjectSourceChunker,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const recoveredCount = await this.embeddingRepository.recoverInterruptedIndexes();
      if (recoveredCount > 0) {
        this.logger.warn("Recovered interrupted Arc project embedding indexes.", { recoveredCount });
      }
    } catch {
      this.logger.warn("Could not recover interrupted Arc project embedding indexes.");
    }
  }

  public async index(projectId: string): Promise<ProjectEmbeddingIndex> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const upstream = await this.loadUpstream(projectId);
    const model = this.config.embedding.model;
    const current = await this.embeddingRepository.getCurrentCatalogRun(projectId);
    if (model !== undefined && current !== null && this.matchesCurrent(current, upstream, model)) {
      return current;
    }

    const providerStatus = await this.embeddingModel.getStatus();
    if (
      providerStatus.status !== "ready" ||
      providerStatus.model === null ||
      providerStatus.dimensions !== embeddingDimensions
    ) {
      throw new ProjectEmbeddingProviderUnavailableError();
    }

    let run: ProjectEmbeddingIndex;
    try {
      run = await this.embeddingRepository.beginIndex({
        projectId,
        sourceIndexRunId: upstream.sourceCatalog.run.id,
        symbolIndexRunId: upstream.symbolRun.id,
        dependencyIndexRunId: upstream.dependencyRun.id,
        frameworkIndexRunId: upstream.frameworkRun.id,
        provider: "ollama",
        model: providerStatus.model,
        dimensions: embeddingDimensions,
        inputFormat,
        chunkerIdentity: PROJECT_SOURCE_CHUNKER_IDENTITY,
      });
    } catch (error) {
      if (error instanceof ProjectEmbeddingIndexAlreadyRunningError) {
        throw error;
      }
      throw new ProjectEmbeddingIndexFailedError();
    }

    try {
      const symbols = await this.loadSymbols(
        projectId,
        upstream.symbolRun.id,
        upstream.sourceCatalog.files.map((file) => file.id),
      );
      const reusable = await this.loadReusable(projectId, providerStatus.model);
      const embedded = await this.embedFiles(
        project,
        upstream.sourceCatalog.files,
        symbols,
        reusable,
        providerStatus.model,
      );
      await this.assertUpstreamUnchanged(projectId, upstream);

      try {
        return await this.embeddingRepository.publishIndex({
          projectId,
          embeddingIndexId: run.id,
          provider: "ollama",
          model: providerStatus.model,
          dimensions: embeddingDimensions,
          inputFormat,
          chunkerIdentity: PROJECT_SOURCE_CHUNKER_IDENTITY,
          files: embedded.files,
          embeddedChunkCount: embedded.embeddedChunkCount,
          reusedChunkCount: embedded.reusedChunkCount,
          limitReasons: mergeLimitReasons(this.upstreamLimitReasons(upstream), embedded.limitReasons),
        });
      } catch {
        throw new EmbeddingRunError("embedding_persistence_error");
      }
    } catch (error) {
      const errorCode = this.toRunErrorCode(error);
      try {
        await this.embeddingRepository.failIndex(projectId, run.id, errorCode);
      } catch {
        this.logger.error("Arc could not persist project embedding index failure state.", {
          embeddingIndexId: run.id,
          projectId,
        });
      }
      throw new ProjectEmbeddingIndexFailedError();
    }
  }

  public async getLatest(projectId: string): Promise<LatestProjectEmbeddingIndexResponse> {
    if ((await this.projectRepository.findById(projectId)) === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const [latestRun, currentCatalog, sourceCatalog, symbolRun, dependencyRun, frameworkRun] = await Promise.all([
      this.embeddingRepository.getLatestRun(projectId),
      this.embeddingRepository.getCurrentCatalogRun(projectId),
      this.sourceRepository.getCurrentReadyCatalog(projectId),
      this.symbolRepository.getCurrentCatalogRun(projectId),
      this.dependencyRepository.getCurrentCatalogRun(projectId),
      this.frameworkRepository.getCurrentCatalogRun(projectId),
    ]);

    return {
      latestRun,
      currentCatalog:
        currentCatalog === null
          ? null
          : {
              ...currentCatalog,
              stale:
                sourceCatalog === null ||
                symbolRun === null ||
                dependencyRun === null ||
                frameworkRun === null ||
                !this.matchesCurrent(
                  currentCatalog,
                  { sourceCatalog, symbolRun, dependencyRun, frameworkRun },
                  this.config.embedding.model,
                ),
            },
    };
  }

  private async embedFiles(
    project: Project,
    sourceFiles: readonly ReadyProjectSourceFile[],
    symbols: readonly ProjectSymbolCatalogRecord[],
    reusable: ReadonlyMap<string, ReusableProjectEmbeddingChunk>,
    model: string,
  ): Promise<EmbeddedFiles> {
    const evaluator = this.ignorePolicy.createEvaluator(project);
    const symbolsByFile = groupBy(symbols, (symbol) => symbol.sourceFileId);
    const files: ProjectEmbeddingFilePublication[] = [];
    const limitReasons = new Set<ProjectEmbeddingIndexLimitReason>();
    let embeddedChunkCount = 0;
    let reusedChunkCount = 0;
    let totalChunks = 0;

    for (const sourceFile of [...sourceFiles].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    )) {
      if ((await evaluator.check({ kind: "file", path: sourceFile.relativePath })).ignored) {
        throw new EmbeddingRunError("upstream_catalog_changed");
      }
      if (totalChunks >= this.config.projectEmbedding.maxTotalChunks) {
        limitReasons.add("total_chunks");
        break;
      }

      let chunkResult;
      try {
        chunkResult = await this.sourceChunker.chunk({
          rootPath: project.rootPath,
          sourceFile,
          symbols: symbolsByFile.get(sourceFile.id) ?? [],
          limits: {
            maxChunksPerFile: this.config.projectEmbedding.maxChunksPerFile,
            maxSourceBytes: this.config.projectEmbedding.maxSourceBytes,
          },
        });
      } catch (error) {
        if (error instanceof ProjectSourceChunkError) {
          throw new EmbeddingRunError("upstream_catalog_changed");
        }
        throw error;
      }

      if (chunkResult.truncated) {
        limitReasons.add("file_chunks");
      }
      const remaining = this.config.projectEmbedding.maxTotalChunks - totalChunks;
      const selectedChunks = chunkResult.chunks.slice(0, remaining);
      if (selectedChunks.length < chunkResult.chunks.length) {
        limitReasons.add("total_chunks");
      }

      const fileChunks: ProjectEmbeddingChunkPublication[] = [];
      for (let offset = 0; offset < selectedChunks.length; offset += this.config.projectEmbedding.batchSize) {
        const batch = selectedChunks.slice(offset, offset + this.config.projectEmbedding.batchSize);
        const missing = batch.filter((chunk) => {
          const previous = reusable.get(chunk.identityKey);
          return previous?.inputHash !== chunk.inputHash;
        });
        const generated = await this.embedBatch(missing, model);
        let generatedIndex = 0;

        for (const chunk of batch) {
          const previous = reusable.get(chunk.identityKey);
          const canReuse = previous?.inputHash === chunk.inputHash;
          const embedding = canReuse ? previous.embedding : generated[generatedIndex++];
          if (embedding === undefined) {
            throw new EmbeddingRunError("embedding_failed");
          }
          fileChunks.push(this.toPublication(chunk, embedding));
          if (canReuse) {
            reusedChunkCount += 1;
          } else {
            embeddedChunkCount += 1;
          }
        }
      }

      totalChunks += fileChunks.length;
      files.push({
        sourceFileId: sourceFile.id,
        relativePath: sourceFile.relativePath,
        sourceContentHash: sourceFile.contentHash,
        language: sourceFile.language,
        status: chunkResult.truncated || selectedChunks.length < chunkResult.chunks.length ? "limited" : "indexed",
        chunks: fileChunks,
      });
    }

    return {
      files,
      embeddedChunkCount,
      reusedChunkCount,
      limitReasons: [...limitReasons],
    };
  }

  private async embedBatch(
    chunks: readonly ProjectSourceChunk[],
    model: string,
  ): Promise<readonly (readonly number[])[]> {
    if (chunks.length === 0) {
      return [];
    }

    try {
      const result = await this.embeddingModel.embed({
        purpose: "document",
        inputs: chunks.map((chunk) => chunk.embeddingInput),
      });
      if (result.model !== model || result.dimensions !== embeddingDimensions) {
        throw new EmbeddingRunError("embedding_failed");
      }
      return result.vectors;
    } catch (error) {
      if (error instanceof EmbeddingRunError) {
        throw error;
      }
      if (
        error instanceof EmbeddingModelError &&
        [
          "EMBEDDING_NOT_CONFIGURED",
          "EMBEDDING_MODEL_NOT_FOUND",
          "EMBEDDING_UNREACHABLE",
          "EMBEDDING_TIMEOUT",
        ].includes(error.code)
      ) {
        throw new EmbeddingRunError("provider_unavailable");
      }
      throw new EmbeddingRunError("embedding_failed");
    }
  }

  private toPublication(chunk: ProjectSourceChunk, embedding: readonly number[]): ProjectEmbeddingChunkPublication {
    return {
      identityKey: chunk.identityKey,
      contentHash: chunk.contentHash,
      inputHash: chunk.inputHash,
      ownerSymbolId: chunk.owner?.id ?? null,
      ownerSymbolIdentityKey: chunk.owner?.identityKey ?? null,
      ownerSymbolKind: chunk.owner?.kind ?? null,
      ownerSymbolName: chunk.owner?.name ?? null,
      ownerSymbolQualifiedName: chunk.owner?.qualifiedName ?? null,
      range: chunk.range,
      embedding,
    };
  }

  private async loadReusable(
    projectId: string,
    model: string,
  ): Promise<ReadonlyMap<string, ReusableProjectEmbeddingChunk>> {
    const chunks = await this.embeddingRepository.findReusableChunks({
      projectId,
      provider: "ollama",
      model,
      dimensions: embeddingDimensions,
      inputFormat,
      chunkerIdentity: PROJECT_SOURCE_CHUNKER_IDENTITY,
    });
    return new Map(chunks.map((chunk) => [chunk.identityKey, chunk]));
  }

  private async loadSymbols(
    projectId: string,
    symbolIndexId: string,
    sourceFileIds: readonly string[],
  ): Promise<ProjectSymbolCatalogRecord[]> {
    const output: ProjectSymbolCatalogRecord[] = [];
    const limit = 500;
    for (let offset = 0; ; offset += limit) {
      const page = await this.symbolRepository.listCatalogSymbols({
        limit,
        offset,
        projectId,
        sourceFileIds,
        symbolIndexId,
      });
      output.push(...page.symbols);
      if (!page.hasMore) {
        return output;
      }
    }
  }

  private async loadUpstream(projectId: string): Promise<EmbeddingUpstreamSnapshot> {
    const [
      sourceCatalog,
      symbolRun,
      dependencyRun,
      frameworkRun,
      sourceLatest,
      symbolLatest,
      dependencyLatest,
      frameworkLatest,
    ] = await Promise.all([
      this.sourceRepository.getCurrentReadyCatalog(projectId),
      this.symbolRepository.getCurrentCatalogRun(projectId),
      this.dependencyRepository.getCurrentCatalogRun(projectId),
      this.frameworkRepository.getCurrentCatalogRun(projectId),
      this.sourceRepository.getLatestRun(projectId),
      this.symbolRepository.getLatestRun(projectId),
      this.dependencyRepository.getLatestRun(projectId),
      this.frameworkRepository.getLatestRun(projectId),
    ]);
    if (sourceCatalog === null || symbolRun === null || dependencyRun === null || frameworkRun === null) {
      throw new ProjectEmbeddingUpstreamCatalogRequiredError(projectId);
    }
    if (
      sourceLatest?.status === "running" ||
      symbolLatest?.status === "running" ||
      dependencyLatest?.status === "running" ||
      frameworkLatest?.status === "running" ||
      symbolRun.sourceIndexRunId !== sourceCatalog.run.id ||
      dependencyRun.sourceIndexRunId !== sourceCatalog.run.id ||
      frameworkRun.sourceIndexRunId !== sourceCatalog.run.id ||
      frameworkRun.symbolIndexRunId !== symbolRun.id ||
      frameworkRun.dependencyIndexRunId !== dependencyRun.id
    ) {
      throw new ProjectEmbeddingUpstreamCatalogStaleError(projectId);
    }

    return { sourceCatalog, symbolRun, dependencyRun, frameworkRun };
  }

  private async assertUpstreamUnchanged(projectId: string, expected: EmbeddingUpstreamSnapshot): Promise<void> {
    const current = await this.loadUpstream(projectId);
    if (
      current.sourceCatalog.run.id !== expected.sourceCatalog.run.id ||
      current.symbolRun.id !== expected.symbolRun.id ||
      current.dependencyRun.id !== expected.dependencyRun.id ||
      current.frameworkRun.id !== expected.frameworkRun.id
    ) {
      throw new EmbeddingRunError("upstream_catalog_changed");
    }
  }

  private matchesCurrent(
    current: ProjectEmbeddingIndex,
    upstream: EmbeddingUpstreamSnapshot,
    model: string | undefined,
  ): boolean {
    return (
      model !== undefined &&
      current.sourceIndexRunId === upstream.sourceCatalog.run.id &&
      current.symbolIndexRunId === upstream.symbolRun.id &&
      current.dependencyIndexRunId === upstream.dependencyRun.id &&
      current.frameworkIndexRunId === upstream.frameworkRun.id &&
      current.model === model &&
      current.dimensions === embeddingDimensions &&
      current.inputFormat === inputFormat &&
      current.chunkerIdentity === PROJECT_SOURCE_CHUNKER_IDENTITY
    );
  }

  private upstreamLimitReasons(upstream: EmbeddingUpstreamSnapshot): readonly ProjectEmbeddingIndexLimitReason[] {
    const reasons: ProjectEmbeddingIndexLimitReason[] = [];
    if (upstream.sourceCatalog.run.status === "limited") {
      reasons.push("source_catalog_limited");
    }
    if (upstream.symbolRun.status === "limited") {
      reasons.push("symbol_catalog_limited");
    }
    if (upstream.dependencyRun.status === "limited") {
      reasons.push("dependency_catalog_limited");
    }
    if (upstream.frameworkRun.status === "limited") {
      reasons.push("framework_catalog_limited");
    }
    return reasons;
  }

  private toRunErrorCode(error: unknown): ProjectEmbeddingIndexErrorCode {
    if (error instanceof EmbeddingRunError) {
      return error.code;
    }
    if (
      error instanceof ProjectEmbeddingUpstreamCatalogRequiredError ||
      error instanceof ProjectEmbeddingUpstreamCatalogStaleError ||
      error instanceof ProjectSourceChunkError
    ) {
      return "upstream_catalog_changed";
    }
    return "embedding_failed";
  }
}

class EmbeddingRunError extends Error {
  public constructor(public readonly code: ProjectEmbeddingIndexErrorCode) {
    super(code);
    this.name = "EmbeddingRunError";
  }
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}

function mergeLimitReasons(
  left: readonly ProjectEmbeddingIndexLimitReason[],
  right: readonly ProjectEmbeddingIndexLimitReason[],
): readonly ProjectEmbeddingIndexLimitReason[] {
  return [...new Set([...left, ...right])];
}
