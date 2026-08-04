import {
  ProjectFrameworkCatalogResponseSchema,
  type ProjectDependencyIndex,
  type ProjectFrameworkCatalogQuery,
  type ProjectFrameworkCatalogResponse,
  type ProjectFrameworkIndex,
  type ProjectSourceIndex,
  type ProjectSymbolIndex,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import {
  ProjectFrameworkCatalogQueryFailedError,
  ProjectFrameworkCatalogRequiredError,
  ProjectFrameworkCatalogStaleError,
  ProjectNotFoundError,
  InvalidProjectPathError,
} from "../domain/project.errors.js";
import {
  PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  PROJECT_FRAMEWORK_INDEX_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  PROJECT_SYMBOL_INDEX_REPOSITORY,
} from "../projects.constants.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import type { ProjectFrameworkIndexRepository } from "../domain/project-framework-index.types.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";

interface FrameworkCatalogSnapshot {
  readonly frameworkRun: ProjectFrameworkIndex;
  readonly sourceRun: ProjectSourceIndex;
  readonly symbolRun: ProjectSymbolIndex;
  readonly dependencyRun: ProjectDependencyIndex;
}

@Injectable()
export class ProjectFrameworkCatalogService {
  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY)
    private readonly sourceRepository: ProjectSourceIndexRepository,
    @Inject(PROJECT_SYMBOL_INDEX_REPOSITORY)
    private readonly symbolRepository: ProjectSymbolIndexRepository,
    @Inject(PROJECT_DEPENDENCY_INDEX_REPOSITORY)
    private readonly dependencyRepository: ProjectDependencyIndexRepository,
    @Inject(PROJECT_FRAMEWORK_INDEX_REPOSITORY)
    private readonly frameworkRepository: ProjectFrameworkIndexRepository,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async getCatalog(
    projectId: string,
    query: ProjectFrameworkCatalogQuery,
  ): Promise<ProjectFrameworkCatalogResponse> {
    try {
      if ((await this.projectRepository.findById(projectId)) === null) {
        throw new ProjectNotFoundError(projectId);
      }
      const path = query.path === undefined ? undefined : this.pathNormalizer.normalize(query.path);
      const scopePath =
        query.scope === undefined ? undefined : query.scope === "." ? "." : this.pathNormalizer.normalize(query.scope);
      const snapshot = await this.loadFreshSnapshot(projectId);
      const records = await this.frameworkRepository.listCatalog({
        entityKinds: query.kind,
        frameworkIndexId: snapshot.frameworkRun.id,
        frameworks: query.framework,
        includeRelationships: query.includeRelations,
        maxEntities: Math.min(query.maxEntities, this.config.projectFramework.catalogMaxEntities),
        maxRelationships: Math.min(query.maxRelationships, this.config.projectFramework.catalogMaxRelationships),
        projectId,
        ...(path === undefined ? {} : { path }),
        ...(scopePath === undefined ? {} : { scopePath }),
      });
      await this.assertSnapshotUnchanged(projectId, snapshot);
      return ProjectFrameworkCatalogResponseSchema.parse({
        entities: records.entities,
        frameworkIndex: snapshot.frameworkRun,
        projectId,
        relationships: records.relationships,
        scopes: records.scopes,
        truncated: {
          entities: records.entityTruncated,
          relationships: records.relationshipTruncated,
        },
      });
    } catch (error) {
      if (isPublicCatalogError(error)) throw error;
      throw new ProjectFrameworkCatalogQueryFailedError();
    }
  }

  private async loadFreshSnapshot(projectId: string): Promise<FrameworkCatalogSnapshot> {
    const [
      frameworkRun,
      sourceRun,
      symbolRun,
      dependencyRun,
      frameworkLatest,
      sourceLatest,
      symbolLatest,
      dependencyLatest,
    ] = await Promise.all([
      this.frameworkRepository.getCurrentCatalogRun(projectId),
      this.sourceRepository.getCurrentCatalogRun(projectId),
      this.symbolRepository.getCurrentCatalogRun(projectId),
      this.dependencyRepository.getCurrentCatalogRun(projectId),
      this.frameworkRepository.getLatestRun(projectId),
      this.sourceRepository.getLatestRun(projectId),
      this.symbolRepository.getLatestRun(projectId),
      this.dependencyRepository.getLatestRun(projectId),
    ]);
    if (frameworkRun === null) throw new ProjectFrameworkCatalogRequiredError(projectId);
    if (
      sourceRun === null ||
      symbolRun === null ||
      dependencyRun === null ||
      frameworkLatest?.status === "running" ||
      sourceLatest?.status === "running" ||
      symbolLatest?.status === "running" ||
      dependencyLatest?.status === "running" ||
      frameworkRun.sourceIndexRunId !== sourceRun.id ||
      frameworkRun.symbolIndexRunId !== symbolRun.id ||
      frameworkRun.dependencyIndexRunId !== dependencyRun.id ||
      symbolRun.sourceIndexRunId !== sourceRun.id ||
      dependencyRun.sourceIndexRunId !== sourceRun.id
    ) {
      throw new ProjectFrameworkCatalogStaleError(projectId);
    }
    return { dependencyRun, frameworkRun, sourceRun, symbolRun };
  }

  private async assertSnapshotUnchanged(projectId: string, expected: FrameworkCatalogSnapshot): Promise<void> {
    const current = await this.loadFreshSnapshot(projectId);
    if (
      current.frameworkRun.id !== expected.frameworkRun.id ||
      current.sourceRun.id !== expected.sourceRun.id ||
      current.symbolRun.id !== expected.symbolRun.id ||
      current.dependencyRun.id !== expected.dependencyRun.id
    ) {
      throw new ProjectFrameworkCatalogStaleError(projectId);
    }
  }
}

function isPublicCatalogError(error: unknown): boolean {
  return (
    error instanceof InvalidProjectPathError ||
    error instanceof ProjectFrameworkCatalogQueryFailedError ||
    error instanceof ProjectFrameworkCatalogRequiredError ||
    error instanceof ProjectFrameworkCatalogStaleError ||
    error instanceof ProjectNotFoundError
  );
}
