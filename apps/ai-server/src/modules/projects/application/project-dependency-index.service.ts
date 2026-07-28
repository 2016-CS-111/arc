import { posix } from "node:path";

import {
  LatestProjectDependencyIndexResponseSchema,
  type LatestProjectDependencyIndexResponse,
  type ProjectDependencyFileErrorCode,
  type ProjectDependencyIndex,
  type ProjectDependencyIndexErrorCode,
  type ProjectDependencyIndexLimitReason,
  type ProjectDependencyResolverWarningCode,
} from "@arc/contracts";
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import {
  PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  PROJECT_INVENTORY_REPOSITORY,
  PROJECT_MODULE_RESOLVER,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  SOURCE_DEPENDENCY_EXTRACTOR,
  SOURCE_TEXT_READER,
} from "../projects.constants.js";
import type {
  CurrentProjectDependencyFile,
  ExtractedSourceDependency,
  ProjectDependencyFileOutcome,
  ResolvedProjectDependency,
  SourceDependencyExtractionResult,
  SourceDependencyLanguage,
} from "../domain/project-dependency-index.types.js";
import type { ProjectModuleMetadataFile } from "../domain/project-module-resolution.types.js";
import type { ReadyProjectSourceFile } from "../domain/project-source-index.types.js";
import {
  ProjectDependencyIndexAlreadyRunningError,
  ProjectDependencyIndexFailedError,
  ProjectNotFoundError,
  ProjectSourceCatalogRequiredError,
  ProjectSourceCatalogStaleError,
} from "../domain/project.errors.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { PreparedProjectModuleResolver, ProjectModuleResolver } from "./project-module.resolver.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { SourceDependencyExtractor } from "./source-dependency.extractor.js";
import type { SourceTextReader } from "./source-text.reader.js";

const reusableStatuses = new Set(["extracted", "extracted_with_errors", "unsupported"]);

interface DependencyPublication {
  readonly bindingCount: number;
  readonly builtinEdgeCount: number;
  readonly edgeCount: number;
  readonly externalEdgeCount: number;
  readonly failedFileCount: number;
  readonly files: readonly ProjectDependencyFileOutcome[];
  readonly limitReasons: readonly ProjectDependencyIndexLimitReason[];
  readonly localEdgeCount: number;
  readonly omittedBindingCount: number;
  readonly omittedEdgeCount: number;
  readonly parsedFileCount: number;
  readonly reusedFileCount: number;
  readonly unresolvedEdgeCount: number;
  readonly unsupportedFileCount: number;
}

@Injectable()
export class ProjectDependencyIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectDependencyIndexService.name);

  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_INVENTORY_REPOSITORY)
    private readonly inventoryRepository: ProjectInventoryRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY)
    private readonly sourceIndexRepository: ProjectSourceIndexRepository,
    @Inject(PROJECT_DEPENDENCY_INDEX_REPOSITORY)
    private readonly dependencyIndexRepository: ProjectDependencyIndexRepository,
    @Inject(SOURCE_TEXT_READER)
    private readonly sourceTextReader: SourceTextReader,
    @Inject(SOURCE_DEPENDENCY_EXTRACTOR)
    private readonly dependencyExtractor: SourceDependencyExtractor,
    @Inject(PROJECT_MODULE_RESOLVER)
    private readonly moduleResolver: ProjectModuleResolver,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const recoveredCount = await this.dependencyIndexRepository.recoverInterruptedIndexes();
      if (recoveredCount > 0) {
        this.logger.warn("Recovered interrupted Arc project dependency indexes.", { recoveredCount });
      }
    } catch {
      this.logger.warn("Could not recover interrupted Arc project dependency indexes.");
    }
  }

  public async index(projectId: string): Promise<ProjectDependencyIndex> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const [inventory, sourceCatalog, latestSourceRun] = await Promise.all([
      this.inventoryRepository.getCurrentSnapshot(projectId),
      this.sourceIndexRepository.getCurrentReadyCatalog(projectId),
      this.sourceIndexRepository.getLatestRun(projectId),
    ]);
    if (sourceCatalog === null) {
      throw new ProjectSourceCatalogRequiredError(projectId);
    }
    if (inventory?.scan.id !== sourceCatalog.run.inventoryScanId || latestSourceRun?.status === "running") {
      throw new ProjectSourceCatalogStaleError(projectId);
    }

    let run: ProjectDependencyIndex;
    try {
      run = await this.dependencyIndexRepository.beginIndex(projectId, sourceCatalog.run.id);
    } catch (error) {
      if (error instanceof ProjectDependencyIndexAlreadyRunningError) {
        throw error;
      }
      throw new ProjectDependencyIndexFailedError();
    }

    let preparedResolver: PreparedProjectModuleResolver | null = null;
    try {
      const metadataFiles = await this.readResolverMetadata(project.rootPath, sourceCatalog.files);
      preparedResolver = this.prepareResolver(project.rootPath, sourceCatalog.files, metadataFiles);
      const currentFiles = await this.dependencyIndexRepository.getCurrentFiles(projectId);
      const publication = await this.buildPublication(
        project.rootPath,
        sourceCatalog.files,
        currentFiles,
        preparedResolver,
      );
      await this.verifyResolutionContext(projectId, project.rootPath, sourceCatalog.run.id, sourceCatalog.files);
      return await this.publish(run, sourceCatalog.run.id, preparedResolver, publication);
    } catch (error) {
      const errorCode = this.toRunErrorCode(error);
      await this.recordFailure(run, errorCode, preparedResolver);
      throw new ProjectDependencyIndexFailedError();
    }
  }

  public async getLatest(projectId: string): Promise<LatestProjectDependencyIndexResponse> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const [latestRun, currentCatalogRun, currentSourceRun] = await Promise.all([
      this.dependencyIndexRepository.getLatestRun(projectId),
      this.dependencyIndexRepository.getCurrentCatalogRun(projectId),
      this.sourceIndexRepository.getCurrentCatalogRun(projectId),
    ]);

    return LatestProjectDependencyIndexResponseSchema.parse({
      currentCatalog:
        currentCatalogRun === null
          ? null
          : {
              bindingCount: currentCatalogRun.bindingCount,
              builtinEdgeCount: currentCatalogRun.builtinEdgeCount,
              completedAt: currentCatalogRun.completedAt,
              dependencyIndexId: currentCatalogRun.id,
              edgeCount: currentCatalogRun.edgeCount,
              externalEdgeCount: currentCatalogRun.externalEdgeCount,
              failedFileCount: currentCatalogRun.failedFileCount,
              limitReasons: currentCatalogRun.limitReasons,
              localEdgeCount: currentCatalogRun.localEdgeCount,
              omittedBindingCount: currentCatalogRun.omittedBindingCount,
              omittedEdgeCount: currentCatalogRun.omittedEdgeCount,
              parsedFileCount: currentCatalogRun.parsedFileCount,
              resolutionContextHash: requireResolutionContextHash(currentCatalogRun),
              resolverWarnings: currentCatalogRun.resolverWarnings,
              reusedFileCount: currentCatalogRun.reusedFileCount,
              sourceIndexRunId: currentCatalogRun.sourceIndexRunId,
              stale: currentSourceRun?.id !== currentCatalogRun.sourceIndexRunId,
              unresolvedEdgeCount: currentCatalogRun.unresolvedEdgeCount,
              unsupportedFileCount: currentCatalogRun.unsupportedFileCount,
            },
      latestRun,
    });
  }

  private prepareResolver(
    rootPath: string,
    sourceFiles: readonly ReadyProjectSourceFile[],
    metadataFiles: readonly ProjectModuleMetadataFile[],
  ): PreparedProjectModuleResolver {
    try {
      return this.moduleResolver.prepare({
        files: sourceFiles.map((file) => ({
          relativePath: file.relativePath,
          sourceFileId: file.id,
        })),
        maxMetadataBytes: this.config.projectDependency.maxConfigBytes,
        metadataFiles,
        rootPath,
      });
    } catch (error) {
      throw new ResolverUnavailableError(error);
    }
  }

  private async buildPublication(
    rootPath: string,
    sourceFiles: readonly ReadyProjectSourceFile[],
    currentFiles: readonly CurrentProjectDependencyFile[],
    resolver: PreparedProjectModuleResolver,
  ): Promise<DependencyPublication> {
    const currentBySourceFile = new Map(currentFiles.map((file) => [file.sourceFileId, file]));
    const files: ProjectDependencyFileOutcome[] = [];
    const limitReasons = new Set<ProjectDependencyIndexLimitReason>();
    let parsedFileCount = 0;
    let reusedFileCount = 0;
    let unsupportedFileCount = 0;
    let failedFileCount = 0;
    let edgeCount = 0;
    let bindingCount = 0;
    let omittedEdgeCount = 0;
    let omittedBindingCount = 0;

    const sortedSourceFiles = [...sourceFiles].sort(
      (left, right) => left.relativePath.localeCompare(right.relativePath) || left.id.localeCompare(right.id),
    );
    for (const [index, sourceFile] of sortedSourceFiles.entries()) {
      const supported = this.dependencyExtractor.supports(sourceFile.language);
      const extractorIdentity = supported
        ? this.extractorIdentity(sourceFile.language)
        : `unsupported:${sourceFile.language}`;
      const current = currentBySourceFile.get(sourceFile.id);
      const remainingEdges = this.config.projectDependency.maxTotalEdges - edgeCount;
      const remainingBindings = this.config.projectDependency.maxTotalBindings - bindingCount;

      let outcome: ProjectDependencyFileOutcome;
      if (
        current !== undefined &&
        this.isReusable(current, sourceFile, extractorIdentity, remainingEdges, remainingBindings)
      ) {
        outcome = this.resolveCurrentFile(current, sourceFile, resolver);
        reusedFileCount += 1;
        if (current.status === "unsupported") {
          unsupportedFileCount += 1;
        }
      } else if (!supported) {
        outcome = this.unsupportedOutcome(sourceFile, extractorIdentity);
        unsupportedFileCount += 1;
      } else if (remainingEdges <= 0 || remainingBindings <= 0) {
        outcome = this.totalLimitOutcome(sourceFile, extractorIdentity);
        if (remainingEdges <= 0) {
          limitReasons.add("total_edges");
        }
        if (remainingBindings <= 0) {
          limitReasons.add("total_bindings");
        }
      } else {
        const extraction = await this.extractFile(
          rootPath,
          sourceFile,
          extractorIdentity,
          remainingEdges,
          remainingBindings,
        );
        outcome = this.resolveFile(extraction.outcome, resolver);
        if (extraction.totalEdgeLimitReached) {
          limitReasons.add("total_edges");
        }
        if (extraction.totalBindingLimitReached) {
          limitReasons.add("total_bindings");
        }
        parsedFileCount += outcome.status === "failed" ? 0 : 1;
        failedFileCount += outcome.status === "failed" ? 1 : 0;
      }

      files.push(outcome);
      edgeCount += outcome.edgeCount;
      bindingCount += outcome.bindingCount;
      omittedEdgeCount += outcome.omittedEdgeCount;
      omittedBindingCount += outcome.omittedBindingCount;

      if ((index + 1) % this.config.projectDependency.yieldEveryFiles === 0) {
        await yieldToEventLoop();
      }
    }

    const resolutionCounts = countResolutions(files);
    return {
      bindingCount,
      builtinEdgeCount: resolutionCounts.builtin,
      edgeCount,
      externalEdgeCount: resolutionCounts.external,
      failedFileCount,
      files,
      limitReasons: [...limitReasons],
      localEdgeCount: resolutionCounts.local,
      omittedBindingCount,
      omittedEdgeCount,
      parsedFileCount,
      reusedFileCount,
      unresolvedEdgeCount: resolutionCounts.unresolved,
      unsupportedFileCount,
    };
  }

  private isReusable(
    current: CurrentProjectDependencyFile,
    sourceFile: ReadyProjectSourceFile,
    extractorIdentity: string,
    remainingEdges: number,
    remainingBindings: number,
  ): boolean {
    const actualBindingCount = current.dependencies.reduce(
      (count, dependency) => count + dependency.bindings.length,
      0,
    );
    return (
      reusableStatuses.has(current.status) &&
      current.sourceContentHash === sourceFile.contentHash &&
      current.relativePath === sourceFile.relativePath &&
      current.language === sourceFile.language &&
      current.extractorIdentity === extractorIdentity &&
      current.dependencies.length === current.edgeCount &&
      actualBindingCount === current.bindingCount &&
      current.edgeCount <= remainingEdges &&
      current.bindingCount <= remainingBindings
    );
  }

  private resolveCurrentFile(
    current: CurrentProjectDependencyFile,
    sourceFile: ReadyProjectSourceFile,
    resolver: PreparedProjectModuleResolver,
  ): ProjectDependencyFileOutcome {
    return {
      bindingCount: current.bindingCount,
      dependencies: this.resolveDependencies(sourceFile.relativePath, current.dependencies, resolver),
      edgeCount: current.edgeCount,
      errorCode: current.errorCode,
      extractedAt: current.extractedAt,
      extractorIdentity: current.extractorIdentity,
      hasSyntaxErrors: current.hasSyntaxErrors,
      language: current.language,
      omittedBindingCount: current.omittedBindingCount,
      omittedEdgeCount: current.omittedEdgeCount,
      relativePath: sourceFile.relativePath,
      sourceContentHash: sourceFile.contentHash,
      sourceFileId: sourceFile.id,
      status: current.status,
    };
  }

  private async extractFile(
    rootPath: string,
    sourceFile: ReadyProjectSourceFile,
    extractorIdentity: string,
    remainingEdges: number,
    remainingBindings: number,
  ): Promise<{
    readonly outcome: ProjectDependencyFileOutcome;
    readonly totalBindingLimitReached: boolean;
    readonly totalEdgeLimitReached: boolean;
  }> {
    const result = await this.sourceTextReader.inspect({
      file: {
        modifiedAt: sourceFile.modifiedAt,
        path: sourceFile.relativePath,
        sizeBytes: sourceFile.sizeBytes,
      },
      maxFileBytes: this.config.projectSource.maxFileBytes,
      rootPath,
    });
    if (result.status !== "ready") {
      return {
        outcome: this.failedOutcome(sourceFile, extractorIdentity, "source_read_error"),
        totalBindingLimitReached: false,
        totalEdgeLimitReached: false,
      };
    }
    if (result.contentHash !== sourceFile.contentHash) {
      return {
        outcome: this.failedOutcome(sourceFile, extractorIdentity, "source_changed"),
        totalBindingLimitReached: false,
        totalEdgeLimitReached: false,
      };
    }

    const maxDependencies = Math.min(this.config.projectDependency.maxEdgesPerFile, remainingEdges);
    try {
      const extraction = this.dependencyExtractor.extract({
        language: sourceFile.language as SourceDependencyLanguage,
        limits: {
          maxBindingNameBytes: this.config.projectDependency.maxBindingNameBytes,
          maxBindingsPerDependency: this.config.projectDependency.maxBindingsPerEdge,
          maxDependencies,
          maxSpecifierBytes: this.config.projectDependency.maxSpecifierBytes,
        },
        source: result.content,
      });
      const constrained = constrainBindings(extraction, remainingBindings);
      const totalEdgeLimitReached =
        remainingEdges < this.config.projectDependency.maxEdgesPerFile &&
        extraction.omissionReasons.includes("dependency_limit");
      const errorCode = dependencyFileLimitError(extraction, constrained.totalBindingLimitReached);
      const dependencies = constrained.dependencies;
      return {
        outcome: {
          bindingCount: countBindings(dependencies),
          dependencies: dependencies.map((dependency) => ({
            ...dependency,
            resolution: { kind: "unresolved", reason: "not_found" as const },
          })),
          edgeCount: dependencies.length,
          errorCode,
          extractedAt: new Date().toISOString(),
          extractorIdentity,
          hasSyntaxErrors: extraction.hasSyntaxErrors,
          language: sourceFile.language,
          omittedBindingCount: extraction.omittedBindingCount + constrained.omittedBindingCount,
          omittedEdgeCount: extraction.omittedDependencyCount + constrained.omittedDependencyCount,
          relativePath: sourceFile.relativePath,
          sourceContentHash: sourceFile.contentHash,
          sourceFileId: sourceFile.id,
          status: errorCode !== null ? "limited" : extraction.hasSyntaxErrors ? "extracted_with_errors" : "extracted",
        },
        totalBindingLimitReached: constrained.totalBindingLimitReached,
        totalEdgeLimitReached,
      };
    } catch (error) {
      if (error instanceof ExtractorUnavailableError) {
        throw error;
      }
      return {
        outcome: this.failedOutcome(sourceFile, extractorIdentity, "parse_error"),
        totalBindingLimitReached: false,
        totalEdgeLimitReached: false,
      };
    }
  }

  private resolveFile(
    file: ProjectDependencyFileOutcome,
    resolver: PreparedProjectModuleResolver,
  ): ProjectDependencyFileOutcome {
    return {
      ...file,
      dependencies: this.resolveDependencies(file.relativePath, file.dependencies, resolver),
    };
  }

  private resolveDependencies(
    relativePath: string,
    dependencies: readonly ExtractedSourceDependency[],
    resolver: PreparedProjectModuleResolver,
  ): readonly ResolvedProjectDependency[] {
    try {
      return dependencies.map((dependency) => ({
        ...dependency,
        resolution: resolver.resolve({
          containingRelativePath: relativePath,
          mode: dependency.kind === "require" ? "require" : "import",
          specifier: dependency.specifier,
        }),
      }));
    } catch (error) {
      throw new ResolverUnavailableError(error);
    }
  }

  private extractorIdentity(language: SourceDependencyLanguage): string {
    try {
      return [
        this.dependencyExtractor.getExtractorIdentity(language),
        `edges=${String(this.config.projectDependency.maxEdgesPerFile)}`,
        `bindings=${String(this.config.projectDependency.maxBindingsPerEdge)}`,
        `specifier=${String(this.config.projectDependency.maxSpecifierBytes)}`,
        `binding-name=${String(this.config.projectDependency.maxBindingNameBytes)}`,
      ].join("/");
    } catch (error) {
      throw new ExtractorUnavailableError(error);
    }
  }

  private unsupportedOutcome(
    sourceFile: ReadyProjectSourceFile,
    extractorIdentity: string,
  ): ProjectDependencyFileOutcome {
    return emptyOutcome(sourceFile, extractorIdentity, "unsupported", "unsupported_language");
  }

  private totalLimitOutcome(
    sourceFile: ReadyProjectSourceFile,
    extractorIdentity: string,
  ): ProjectDependencyFileOutcome {
    return emptyOutcome(sourceFile, extractorIdentity, "limited", "dependency_limit");
  }

  private failedOutcome(
    sourceFile: ReadyProjectSourceFile,
    extractorIdentity: string,
    errorCode: Extract<ProjectDependencyFileErrorCode, "source_changed" | "source_read_error" | "parse_error">,
  ): ProjectDependencyFileOutcome {
    return emptyOutcome(sourceFile, extractorIdentity, "failed", errorCode);
  }

  private async readResolverMetadata(
    rootPath: string,
    sourceFiles: readonly ReadyProjectSourceFile[],
  ): Promise<readonly ProjectModuleMetadataFile[]> {
    const metadataFiles: ProjectModuleMetadataFile[] = [];
    for (const sourceFile of sourceFiles.filter((file) => isResolverMetadataPath(file.relativePath))) {
      const result = await this.sourceTextReader.inspect({
        file: {
          modifiedAt: sourceFile.modifiedAt,
          path: sourceFile.relativePath,
          sizeBytes: sourceFile.sizeBytes,
        },
        maxFileBytes: this.config.projectDependency.maxConfigBytes,
        rootPath,
      });
      if (result.status !== "ready" || result.contentHash !== sourceFile.contentHash) {
        throw new ResolutionContextChangedError();
      }
      metadataFiles.push({
        content: result.content,
        contentHash: result.contentHash,
        relativePath: sourceFile.relativePath,
      });
    }
    return metadataFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  private async verifyResolutionContext(
    projectId: string,
    rootPath: string,
    sourceIndexRunId: string,
    sourceFiles: readonly ReadyProjectSourceFile[],
  ): Promise<void> {
    const [currentSourceRun] = await Promise.all([
      this.sourceIndexRepository.getCurrentCatalogRun(projectId),
      this.readResolverMetadata(rootPath, sourceFiles),
    ]);
    if (currentSourceRun?.id !== sourceIndexRunId) {
      throw new ResolutionContextChangedError();
    }
  }

  private async publish(
    run: ProjectDependencyIndex,
    sourceIndexRunId: string,
    resolver: PreparedProjectModuleResolver,
    publication: DependencyPublication,
  ): Promise<ProjectDependencyIndex> {
    try {
      return await this.dependencyIndexRepository.publishIndex({
        ...publication,
        batchSize: this.config.projectDependency.batchSize,
        dependencyIndexId: run.id,
        projectId: run.projectId,
        resolutionContextHash: resolver.resolutionContextHash,
        resolverWarnings: resolverWarningCodes(resolver),
        sourceIndexRunId,
      });
    } catch (error) {
      throw new DependencyPersistenceError(error);
    }
  }

  private toRunErrorCode(error: unknown): ProjectDependencyIndexErrorCode {
    if (error instanceof ExtractorUnavailableError) {
      return "extractor_unavailable";
    }
    if (error instanceof ResolverUnavailableError) {
      return "resolver_unavailable";
    }
    if (error instanceof ResolutionContextChangedError) {
      return "resolution_context_changed";
    }
    if (error instanceof DependencyPersistenceError) {
      return "dependency_persistence_error";
    }
    return "unknown_error";
  }

  private async recordFailure(
    run: ProjectDependencyIndex,
    errorCode: ProjectDependencyIndexErrorCode,
    resolver: PreparedProjectModuleResolver | null,
  ): Promise<void> {
    try {
      await this.dependencyIndexRepository.failIndex({
        dependencyIndexId: run.id,
        errorCode,
        projectId: run.projectId,
        ...(resolver === null
          ? {}
          : {
              resolutionContextHash: resolver.resolutionContextHash,
              resolverWarnings: resolverWarningCodes(resolver),
            }),
      });
    } catch {
      this.logger.warn("Could not persist an Arc dependency-index failure.", {
        dependencyIndexId: run.id,
        errorCode,
        projectId: run.projectId,
      });
    }
  }
}

function emptyOutcome(
  sourceFile: ReadyProjectSourceFile,
  extractorIdentity: string,
  status: Extract<ProjectDependencyFileOutcome["status"], "unsupported" | "limited" | "failed">,
  errorCode: Exclude<ProjectDependencyFileErrorCode, "dependency_text_limit">,
): ProjectDependencyFileOutcome {
  return {
    bindingCount: 0,
    dependencies: [],
    edgeCount: 0,
    errorCode,
    extractedAt: new Date().toISOString(),
    extractorIdentity,
    hasSyntaxErrors: false,
    language: sourceFile.language,
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    relativePath: sourceFile.relativePath,
    sourceContentHash: sourceFile.contentHash,
    sourceFileId: sourceFile.id,
    status,
  };
}

function constrainBindings(
  extraction: SourceDependencyExtractionResult,
  remainingBindings: number,
): {
  readonly dependencies: readonly ExtractedSourceDependency[];
  readonly omittedBindingCount: number;
  readonly omittedDependencyCount: number;
  readonly totalBindingLimitReached: boolean;
} {
  let bindingCount = 0;
  for (const [index, dependency] of extraction.dependencies.entries()) {
    if (bindingCount + dependency.bindings.length > remainingBindings) {
      const omittedDependencies = extraction.dependencies.slice(index);
      return {
        dependencies: extraction.dependencies.slice(0, index),
        omittedBindingCount: countBindings(omittedDependencies),
        omittedDependencyCount: omittedDependencies.length,
        totalBindingLimitReached: true,
      };
    }
    bindingCount += dependency.bindings.length;
  }
  return {
    dependencies: extraction.dependencies,
    omittedBindingCount: 0,
    omittedDependencyCount: 0,
    totalBindingLimitReached: false,
  };
}

function dependencyFileLimitError(
  extraction: SourceDependencyExtractionResult,
  totalBindingLimitReached: boolean,
): Extract<ProjectDependencyFileErrorCode, "dependency_limit" | "dependency_text_limit"> | null {
  if (
    totalBindingLimitReached ||
    extraction.omissionReasons.includes("dependency_limit") ||
    extraction.omissionReasons.includes("binding_limit")
  ) {
    return "dependency_limit";
  }
  return extraction.omissionReasons.includes("specifier_text_limit") ||
    extraction.omissionReasons.includes("binding_text_limit")
    ? "dependency_text_limit"
    : null;
}

function countBindings(dependencies: readonly ExtractedSourceDependency[]): number {
  return dependencies.reduce((count, dependency) => count + dependency.bindings.length, 0);
}

function countResolutions(
  files: readonly ProjectDependencyFileOutcome[],
): Record<"local" | "external" | "builtin" | "unresolved", number> {
  const counts = { builtin: 0, external: 0, local: 0, unresolved: 0 };
  for (const dependency of files.flatMap((file) => file.dependencies)) {
    counts[dependency.resolution.kind] += 1;
  }
  return counts;
}

function resolverWarningCodes(
  resolver: PreparedProjectModuleResolver,
): readonly ProjectDependencyResolverWarningCode[] {
  return [...new Set(resolver.warnings.map((warning) => warning.code))];
}

function isResolverMetadataPath(relativePath: string): boolean {
  const basename = posix.basename(relativePath);
  return (
    basename === "package.json" ||
    ((basename.startsWith("tsconfig") || basename.startsWith("jsconfig")) && basename.endsWith(".json"))
  );
}

function requireResolutionContextHash(run: ProjectDependencyIndex): string {
  if (run.resolutionContextHash === null) {
    throw new Error("Published Arc dependency index is missing its resolution context hash.");
  }
  return run.resolutionContextHash;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class ExtractorUnavailableError extends Error {
  public constructor(cause: unknown) {
    super("Arc dependency extractor is unavailable.", { cause });
    this.name = "ExtractorUnavailableError";
  }
}

class ResolverUnavailableError extends Error {
  public constructor(cause: unknown) {
    super("Arc project module resolver is unavailable.", { cause });
    this.name = "ResolverUnavailableError";
  }
}

class ResolutionContextChangedError extends Error {
  public constructor() {
    super("Arc project module-resolution context changed during indexing.");
    this.name = "ResolutionContextChangedError";
  }
}

class DependencyPersistenceError extends Error {
  public constructor(cause: unknown) {
    super("Arc could not publish the dependency graph.", { cause });
    this.name = "DependencyPersistenceError";
  }
}
