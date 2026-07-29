import { createHash } from "node:crypto";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import type {
  LatestProjectFrameworkIndexResponse,
  ProjectDependencyIndex,
  ProjectFrameworkIndex,
  ProjectFrameworkIndexErrorCode,
  ProjectFrameworkIndexLimitReason,
  ProjectFrameworkIndexWarning,
  ProjectSourceFileSkipReason,
  ProjectSymbolIndex,
} from "@arc/contracts";
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import {
  PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  PROJECT_FRAMEWORK_INDEX_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  PROJECT_SYMBOL_INDEX_REPOSITORY,
  SOURCE_TEXT_READER,
} from "../projects.constants.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectFrameworkImportResolver } from "./project-framework-import.resolver.js";
import { ProjectFrameworkScopeDetector } from "./project-framework-scope.detector.js";
import type { ProjectFrameworkAnalyzer } from "./project-framework.analyzer.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";
import type { SourceTextReader } from "./source-text.reader.js";
import type {
  ProjectFrameworkFileOutcome,
  ProjectFrameworkIndexRepository,
  ReusableProjectFrameworkCatalog,
} from "../domain/project-framework-index.types.js";
import type {
  ProjectFrameworkDependency,
  ProjectFrameworkFileScope,
  ProjectFrameworkPackageMetadata,
  ProjectFrameworkScope,
  SourceFrameworkEvidence,
  SourceFrameworkEvidenceExtractionResult,
  SourceFrameworkEvidenceOmissionReason,
} from "../domain/project-framework.types.js";
import type { ReadyProjectSourceFile, ProjectSourceCatalogSnapshot } from "../domain/project-source-index.types.js";
import type { ProjectSymbolCatalogRecord } from "../domain/project-symbol-index.types.js";
import {
  ProjectFrameworkIndexFailedError,
  ProjectFrameworkUpstreamCatalogRequiredError,
  ProjectFrameworkUpstreamCatalogStaleError,
  ProjectNotFoundError,
} from "../domain/project.errors.js";
import { TreeSitterExpressFrameworkAnalyzer } from "../infrastructure/tree-sitter/tree-sitter-express-framework.analyzer.js";
import { TreeSitterFrameworkEvidenceExtractor } from "../infrastructure/tree-sitter/tree-sitter-framework-evidence.extractor.js";
import { TreeSitterNestFrameworkAnalyzer } from "../infrastructure/tree-sitter/tree-sitter-nest-framework.analyzer.js";
import {
  TreeSitterNextFrameworkAnalyzer,
  TreeSitterReactFrameworkAnalyzer,
} from "../infrastructure/tree-sitter/tree-sitter-next-react-framework.analyzer.js";
import { TreeSitterSequelizeFrameworkAnalyzer } from "../infrastructure/tree-sitter/tree-sitter-sequelize-framework.analyzer.js";

interface FrameworkUpstreamSnapshot {
  readonly sourceCatalog: ProjectSourceCatalogSnapshot;
  readonly symbolRun: ProjectSymbolIndex;
  readonly dependencyRun: ProjectDependencyIndex;
}

interface FrameworkFileTask {
  readonly scope: ProjectFrameworkScope;
  readonly sourceFile: ReadyProjectSourceFile;
}

interface FrameworkAnalysis {
  readonly analyzedFileCount: number;
  readonly failedFileCount: number;
  readonly files: readonly ProjectFrameworkFileOutcome[];
  readonly limitReasons: readonly ProjectFrameworkIndexLimitReason[];
  readonly reusedFileCount: number;
  readonly scopes: readonly ProjectFrameworkScope[];
  readonly unsupportedFileCount: number;
  readonly warnings: readonly ProjectFrameworkIndexWarning[];
}

interface EvidenceInput {
  readonly evidence: readonly SourceFrameworkEvidence[];
  readonly extractorIdentity: string;
  readonly extractionOmissionCount: number;
  readonly extractionOmissionReasons: readonly SourceFrameworkEvidenceOmissionReason[];
  readonly hasSyntaxErrors: boolean;
}

@Injectable()
export class ProjectFrameworkIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectFrameworkIndexService.name);
  private readonly extractor = new TreeSitterFrameworkEvidenceExtractor();
  private readonly scopeDetector = new ProjectFrameworkScopeDetector();
  private readonly importResolver = new ProjectFrameworkImportResolver();
  private readonly analyzers: readonly ProjectFrameworkAnalyzer[] = [
    new TreeSitterNestFrameworkAnalyzer(),
    new TreeSitterExpressFrameworkAnalyzer(),
    new TreeSitterNextFrameworkAnalyzer(),
    new TreeSitterReactFrameworkAnalyzer(),
    new TreeSitterSequelizeFrameworkAnalyzer(),
  ];

  public constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY) private readonly sourceRepository: ProjectSourceIndexRepository,
    @Inject(PROJECT_SYMBOL_INDEX_REPOSITORY) private readonly symbolRepository: ProjectSymbolIndexRepository,
    @Inject(PROJECT_DEPENDENCY_INDEX_REPOSITORY)
    private readonly dependencyRepository: ProjectDependencyIndexRepository,
    @Inject(PROJECT_FRAMEWORK_INDEX_REPOSITORY) private readonly frameworkRepository: ProjectFrameworkIndexRepository,
    @Inject(SOURCE_TEXT_READER) private readonly sourceReader: SourceTextReader,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const recoveredCount = await this.frameworkRepository.recoverInterruptedIndexes();
      if (recoveredCount > 0) {
        this.logger.warn("Recovered interrupted Arc project framework indexes.", { recoveredCount });
      }
    } catch {
      this.logger.warn("Could not recover interrupted Arc project framework indexes.");
    }
  }

  public async index(projectId: string): Promise<ProjectFrameworkIndex> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) throw new ProjectNotFoundError(projectId);

    const upstream = await this.loadUpstream(projectId);
    const analyzerSetIdentity = this.getAnalyzerSetIdentity();
    const current = await this.frameworkRepository.getCurrentCatalogRun(projectId);
    if (current !== null && this.matchesCurrent(current, upstream, analyzerSetIdentity)) return current;

    const reusable =
      current?.analyzerSetIdentity === analyzerSetIdentity
        ? await this.frameworkRepository.getCurrentReusableCatalog(projectId)
        : null;
    const run = await this.frameworkRepository.beginIndex({
      analyzerSetIdentity,
      dependencyIndexRunId: upstream.dependencyRun.id,
      projectId,
      sourceIndexRunId: upstream.sourceCatalog.run.id,
      symbolIndexRunId: upstream.symbolRun.id,
    });

    try {
      const sourceFileIds = upstream.sourceCatalog.files.map((file) => file.id);
      const [dependencies, symbols] = await Promise.all([
        this.loadDependencies(projectId, upstream.dependencyRun.id, sourceFileIds),
        this.loadSymbols(projectId, upstream.symbolRun.id, sourceFileIds),
      ]);
      const analysis = await this.analyze({
        dependencies,
        projectId,
        reusable,
        rootPath: project.rootPath,
        sourceCatalog: upstream.sourceCatalog,
        symbols,
      });
      await this.assertUpstreamUnchanged(projectId, upstream);
      return await this.frameworkRepository.publishIndex({
        analyzedFileCount: analysis.analyzedFileCount,
        dependencyIndexRunId: upstream.dependencyRun.id,
        failedFileCount: analysis.failedFileCount,
        files: analysis.files,
        frameworkIndexId: run.id,
        limitReasons: mergeLimitReasons(this.upstreamLimitReasons(upstream), analysis.limitReasons),
        projectId,
        reusedFileCount: analysis.reusedFileCount,
        scopes: analysis.scopes,
        sourceIndexRunId: upstream.sourceCatalog.run.id,
        symbolIndexRunId: upstream.symbolRun.id,
        unsupportedFileCount: analysis.unsupportedFileCount,
        warnings: analysis.warnings,
      });
    } catch (error) {
      const errorCode =
        error instanceof FrameworkRunError
          ? error.code
          : error instanceof ProjectFrameworkUpstreamCatalogStaleError
            ? "upstream_catalog_changed"
            : "framework_persistence_error";
      try {
        await this.frameworkRepository.failIndex(projectId, run.id, errorCode);
      } catch {
        this.logger.warn("Could not record a failed Arc project framework index.", {
          frameworkIndexId: run.id,
          projectId,
        });
      }
      if (error instanceof ProjectFrameworkUpstreamCatalogStaleError) throw error;
      throw new ProjectFrameworkIndexFailedError();
    }
  }

  public async getLatest(projectId: string): Promise<LatestProjectFrameworkIndexResponse> {
    if ((await this.projectRepository.findById(projectId)) === null) throw new ProjectNotFoundError(projectId);
    const [current, latest, sourceRun, symbolRun, dependencyRun, sourceLatest, symbolLatest, dependencyLatest] =
      await Promise.all([
        this.frameworkRepository.getCurrentCatalogRun(projectId),
        this.frameworkRepository.getLatestRun(projectId),
        this.sourceRepository.getCurrentCatalogRun(projectId),
        this.symbolRepository.getCurrentCatalogRun(projectId),
        this.dependencyRepository.getCurrentCatalogRun(projectId),
        this.sourceRepository.getLatestRun(projectId),
        this.symbolRepository.getLatestRun(projectId),
        this.dependencyRepository.getLatestRun(projectId),
      ]);
    return {
      currentCatalog:
        current === null
          ? null
          : {
              ...current,
              stale:
                sourceRun === null ||
                symbolRun === null ||
                dependencyRun === null ||
                sourceLatest?.status === "running" ||
                symbolLatest?.status === "running" ||
                dependencyLatest?.status === "running" ||
                current.sourceIndexRunId !== sourceRun.id ||
                current.symbolIndexRunId !== symbolRun.id ||
                current.dependencyIndexRunId !== dependencyRun.id,
            },
      latestRun: latest,
    };
  }

  private async analyze(input: {
    readonly dependencies: readonly ProjectFrameworkDependency[];
    readonly projectId: string;
    readonly reusable: ReusableProjectFrameworkCatalog | null;
    readonly rootPath: string;
    readonly sourceCatalog: ProjectSourceCatalogSnapshot;
    readonly symbols: readonly ProjectSymbolCatalogRecord[];
  }): Promise<FrameworkAnalysis> {
    const canReuseScopes = input.reusable?.run.sourceIndexRunId === input.sourceCatalog.run.id;
    const detection = canReuseScopes
      ? {
          fileScopes: [] as readonly ProjectFrameworkFileScope[],
          scopes: input.reusable.scopes,
          warnings: [] as readonly ProjectFrameworkIndexWarning[],
        }
      : await this.detectScopes(input.projectId, input.rootPath, input.sourceCatalog.files, input.dependencies);
    const sourceFiles = new Map(input.sourceCatalog.files.map((file) => [file.id, file]));
    const scopes = new Map(detection.scopes.map((scope) => [scope.scopeKey, scope]));
    const tasks: FrameworkFileTask[] = [];

    if (canReuseScopes) {
      for (const file of input.reusable.files) {
        const scope = scopes.get(file.scopeKey);
        const sourceFile = sourceFiles.get(file.sourceFileId);
        if (scope !== undefined && sourceFile !== undefined) tasks.push({ scope, sourceFile });
      }
    } else {
      for (const fileScope of detection.fileScopes) {
        const sourceFile = sourceFiles.get(fileScope.sourceFileId);
        if (sourceFile === undefined) continue;
        for (const scopeKey of fileScope.scopeKeys) {
          const scope = scopes.get(scopeKey);
          if (scope !== undefined) tasks.push({ scope, sourceFile });
        }
      }
    }

    return this.analyzeTasks({
      dependencies: input.dependencies,
      projectId: input.projectId,
      reusableFiles: input.reusable?.files ?? [],
      rootPath: input.rootPath,
      scopes: detection.scopes,
      symbols: input.symbols,
      tasks,
      warnings: detection.warnings,
    });
  }

  private async analyzeTasks(input: {
    readonly dependencies: readonly ProjectFrameworkDependency[];
    readonly projectId: string;
    readonly reusableFiles: readonly ProjectFrameworkFileOutcome[];
    readonly rootPath: string;
    readonly scopes: readonly ProjectFrameworkScope[];
    readonly symbols: readonly ProjectSymbolCatalogRecord[];
    readonly tasks: readonly FrameworkFileTask[];
    readonly warnings: readonly ProjectFrameworkIndexWarning[];
  }): Promise<FrameworkAnalysis> {
    const dependenciesByFile = groupBy(input.dependencies, (item) => item.sourceFileId);
    const symbolsByFile = groupBy(input.symbols, (item) => item.sourceFileId);
    const importBindings = this.importResolver.resolve(input.dependencies);
    const reusableByTask = new Map(
      input.reusableFiles.map((file) => [taskKey(file.sourceFileId, file.scopeKey), file]),
    );
    const taskGroups = groupBy(input.tasks, (task) => task.sourceFile.id);
    const files: ProjectFrameworkFileOutcome[] = [];
    const limitReasons = new Set<ProjectFrameworkIndexLimitReason>();
    let analyzedFileCount = 0;
    let reusedFileCount = 0;
    let failedFileCount = 0;
    let unsupportedFileCount = 0;
    let processedFileCount = 0;
    let totalEntityCount = 0;
    let totalRelationshipCount = 0;

    for (const tasks of taskGroups.values()) {
      const sourceFile = tasks[0]?.sourceFile;
      if (sourceFile === undefined) continue;
      if (!this.extractor.supports(sourceFile.language)) {
        for (const task of tasks) {
          files.push(this.unsupportedOutcome(task));
          unsupportedFileCount += 1;
        }
        continue;
      }

      const cached = tasks.map((task) => reusableByTask.get(taskKey(sourceFile.id, task.scope.scopeKey)) ?? null);
      const reusable = tasks.every((task, index) => {
        const file = cached[index];
        return file !== null && file !== undefined && this.isReusable(file, task);
      });
      let evidenceInput: EvidenceInput;
      if (reusable) {
        const first = cached[0];
        if (first === null || first === undefined) throw new FrameworkRunError("unknown_error");
        evidenceInput = {
          evidence: first.evidence,
          extractorIdentity: first.extractorIdentity,
          extractionOmissionCount: first.extractionOmissionCount,
          extractionOmissionReasons: first.extractionOmissionReasons,
          hasSyntaxErrors: first.hasSyntaxErrors,
        };
      } else {
        const read = await this.sourceReader.inspect({
          file: {
            modifiedAt: sourceFile.modifiedAt,
            path: sourceFile.relativePath,
            sizeBytes: sourceFile.sizeBytes,
          },
          maxFileBytes: this.config.projectSource.maxFileBytes,
          rootPath: input.rootPath,
        });
        if (read.status !== "ready") {
          if (isStaleSourceRead(read.skipReason)) {
            throw new ProjectFrameworkUpstreamCatalogStaleError(input.projectId);
          }
          for (const task of tasks) {
            files.push(this.failedOutcome(task, "source_read_error"));
            failedFileCount += 1;
          }
          limitReasons.add("upstream_file_gaps");
          continue;
        }
        if (read.contentHash !== sourceFile.contentHash) {
          throw new ProjectFrameworkUpstreamCatalogStaleError(input.projectId);
        }
        try {
          const extracted = this.extractor.extract({
            language: sourceFile.language,
            limits: this.evidenceLimits(),
            source: read.content,
          });
          evidenceInput = toEvidenceInput(extracted);
        } catch {
          for (const task of tasks) {
            files.push(this.failedOutcome(task, "parse_error"));
            failedFileCount += 1;
          }
          limitReasons.add("upstream_file_gaps");
          continue;
        }
      }

      for (const [index, task] of tasks.entries()) {
        const analyzer = this.analyzers.find((candidate) => candidate.framework === task.scope.framework);
        if (analyzer === undefined) throw new FrameworkRunError("analyzer_unavailable");
        const result = analyzer.analyze({
          dependencies: dependenciesByFile.get(sourceFile.id) ?? [],
          evidence: evidenceInput.evidence,
          importBindings,
          limits: {
            maxEntities: this.config.projectFramework.maxEntitiesPerFile,
            maxNameBytes: this.config.projectFramework.maxNameBytes,
            maxRelationships: this.config.projectFramework.maxRelationshipsPerFile,
          },
          relativePath: sourceFile.relativePath,
          scopeKey: task.scope.scopeKey,
          sourceFileId: sourceFile.id,
          symbols: symbolsByFile.get(sourceFile.id) ?? [],
        });
        const outcome = this.applyTotalLimits(
          this.analysisOutcome(task, analyzer, evidenceInput, result),
          totalEntityCount,
          totalRelationshipCount,
          limitReasons,
        );
        totalEntityCount += outcome.entities.length;
        totalRelationshipCount += outcome.relationships.length;
        files.push(outcome);
        if (reusable && cached[index] !== null) reusedFileCount += 1;
        else analyzedFileCount += 1;
        if (outcome.status === "limited") limitReasons.add("file_limits");
      }

      processedFileCount += 1;
      if (processedFileCount % this.config.projectFramework.yieldEveryFiles === 0) await yieldToEventLoop();
    }

    return {
      analyzedFileCount,
      failedFileCount,
      files,
      limitReasons: [...limitReasons],
      reusedFileCount,
      scopes: input.scopes,
      unsupportedFileCount,
      warnings: input.warnings,
    };
  }

  private analysisOutcome(
    task: FrameworkFileTask,
    analyzer: ProjectFrameworkAnalyzer,
    evidence: EvidenceInput,
    result: ReturnType<ProjectFrameworkAnalyzer["analyze"]>,
  ): ProjectFrameworkFileOutcome {
    const limited =
      evidence.extractionOmissionReasons.length > 0 ||
      result.omissions.some((omission) => omission.reason !== "dynamic_value");
    return {
      analyzerIdentity: this.getEffectiveAnalyzerIdentity(task, analyzer),
      entities: result.entities,
      errorCode: limited ? "framework_limit" : null,
      evidence: evidence.evidence,
      extractorIdentity: evidence.extractorIdentity,
      extractionOmissionCount: evidence.extractionOmissionCount,
      extractionOmissionReasons: evidence.extractionOmissionReasons,
      hasSyntaxErrors: evidence.hasSyntaxErrors,
      language: task.sourceFile.language,
      omissionCount: evidence.extractionOmissionCount + result.omissions.length,
      relationships: result.relationships,
      relativePath: task.sourceFile.relativePath,
      scopeKey: task.scope.scopeKey,
      sourceContentHash: task.sourceFile.contentHash,
      sourceFileId: task.sourceFile.id,
      status: limited ? "limited" : evidence.hasSyntaxErrors ? "analyzed_with_errors" : "analyzed",
    };
  }

  private applyTotalLimits(
    outcome: ProjectFrameworkFileOutcome,
    entityCount: number,
    relationshipCount: number,
    limitReasons: Set<ProjectFrameworkIndexLimitReason>,
  ): ProjectFrameworkFileOutcome {
    const entityLimit = Math.max(0, this.config.projectFramework.maxTotalEntities - entityCount);
    const entities = outcome.entities.slice(0, entityLimit);
    const entityIdentities = new Set(entities.map((entity) => entity.identityKey));
    const eligibleRelationships = outcome.relationships.filter((relationship) =>
      entityIdentities.has(relationship.sourceEntityIdentityKey),
    );
    const relationshipLimit = Math.max(0, this.config.projectFramework.maxTotalRelationships - relationshipCount);
    const relationships = eligibleRelationships.slice(0, relationshipLimit);
    const omitted = outcome.entities.length - entities.length + outcome.relationships.length - relationships.length;
    if (outcome.entities.length > entities.length) limitReasons.add("total_entities");
    if (outcome.relationships.length > relationships.length) limitReasons.add("total_relationships");
    if (omitted === 0) return outcome;
    return {
      ...outcome,
      entities,
      errorCode: "framework_limit",
      omissionCount: outcome.omissionCount + omitted,
      relationships,
      status: "limited",
    };
  }

  private unsupportedOutcome(task: FrameworkFileTask): ProjectFrameworkFileOutcome {
    return {
      analyzerIdentity: hash(["unsupported", task.scope.contextHash, task.sourceFile.language]),
      entities: [],
      errorCode: "unsupported_language",
      evidence: [],
      extractorIdentity: "unsupported",
      extractionOmissionCount: 0,
      extractionOmissionReasons: [],
      hasSyntaxErrors: false,
      language: task.sourceFile.language,
      omissionCount: 0,
      relationships: [],
      relativePath: task.sourceFile.relativePath,
      scopeKey: task.scope.scopeKey,
      sourceContentHash: task.sourceFile.contentHash,
      sourceFileId: task.sourceFile.id,
      status: "unsupported",
    };
  }

  private failedOutcome(task: FrameworkFileTask, errorCode: string): ProjectFrameworkFileOutcome {
    return {
      ...this.unsupportedOutcome(task),
      analyzerIdentity: hash(["failed", task.scope.contextHash, task.sourceFile.language]),
      errorCode,
      extractorIdentity: this.extractor.supports(task.sourceFile.language)
        ? this.extractor.getExtractorIdentity(task.sourceFile.language)
        : "unsupported",
      status: "failed",
    };
  }

  private isReusable(file: ProjectFrameworkFileOutcome, task: FrameworkFileTask): boolean {
    if (file.status !== "analyzed" && file.status !== "analyzed_with_errors") return false;
    if (!this.extractor.supports(task.sourceFile.language)) return false;
    const analyzer = this.analyzers.find((candidate) => candidate.framework === task.scope.framework);
    return (
      analyzer !== undefined &&
      file.sourceFileId === task.sourceFile.id &&
      file.relativePath === task.sourceFile.relativePath &&
      file.sourceContentHash === task.sourceFile.contentHash &&
      file.language === task.sourceFile.language &&
      file.extractorIdentity === this.extractor.getExtractorIdentity(task.sourceFile.language) &&
      file.analyzerIdentity === this.getEffectiveAnalyzerIdentity(task, analyzer)
    );
  }

  private getEffectiveAnalyzerIdentity(task: FrameworkFileTask, analyzer: ProjectFrameworkAnalyzer): string {
    return hash([
      analyzer.getAnalyzerIdentity(),
      this.extractor.supports(task.sourceFile.language)
        ? this.extractor.getExtractorIdentity(task.sourceFile.language)
        : "unsupported",
      task.scope.contextHash,
      JSON.stringify(this.evidenceLimits()),
      JSON.stringify({
        maxEntities: this.config.projectFramework.maxEntitiesPerFile,
        maxNameBytes: this.config.projectFramework.maxNameBytes,
        maxRelationships: this.config.projectFramework.maxRelationshipsPerFile,
      }),
    ]);
  }

  private getAnalyzerSetIdentity(): string {
    return hash([
      ...this.analyzers.map((item) => item.getAnalyzerIdentity()).sort(),
      ...(["javascript", "javascriptreact", "typescript", "typescriptreact"] as const).map((language) =>
        this.extractor.getExtractorIdentity(language),
      ),
      JSON.stringify(this.config.projectFramework),
    ]);
  }

  private evidenceLimits() {
    return {
      maxCollectionEntries: this.config.projectFramework.maxCollectionEntries,
      maxEvidence: this.config.projectFramework.maxEvidencePerFile,
      maxNameBytes: this.config.projectFramework.maxNameBytes,
      maxStaticDepth: this.config.projectFramework.maxStaticDepth,
      maxStaticValueBytes: this.config.projectFramework.maxStaticValueBytes,
    };
  }

  private async detectScopes(
    projectId: string,
    rootPath: string,
    sourceFiles: readonly ReadyProjectSourceFile[],
    dependencies: readonly ProjectFrameworkDependency[],
  ): Promise<{
    readonly fileScopes: readonly ProjectFrameworkFileScope[];
    readonly scopes: readonly ProjectFrameworkScope[];
    readonly warnings: readonly ProjectFrameworkIndexWarning[];
  }> {
    const packageMetadata: ProjectFrameworkPackageMetadata[] = [];
    const warnings = new Set<ProjectFrameworkIndexWarning>();
    for (const file of sourceFiles.filter((candidate) => candidate.relativePath.endsWith("package.json"))) {
      const read = await this.sourceReader.inspect({
        file: { modifiedAt: file.modifiedAt, path: file.relativePath, sizeBytes: file.sizeBytes },
        maxFileBytes: this.config.projectFramework.maxPackageMetadataBytes,
        rootPath,
      });
      if (read.status !== "ready") {
        if (isStaleSourceRead(read.skipReason)) {
          throw new ProjectFrameworkUpstreamCatalogStaleError(projectId);
        }
        warnings.add("package_metadata_invalid");
        continue;
      }
      if (read.contentHash !== file.contentHash) throw new ProjectFrameworkUpstreamCatalogStaleError(projectId);
      packageMetadata.push({
        content: read.content,
        contentHash: file.contentHash,
        relativePath: file.relativePath,
        sourceFileId: file.id,
      });
    }
    const detection = this.scopeDetector.detect({
      dependencies,
      packageMetadata,
      projectId,
      sourceFiles: sourceFiles.map((file) => ({
        relativePath: file.relativePath,
        sourceFileId: file.id,
      })),
    });
    for (const warning of detection.warnings) warnings.add(warning.code);
    return { fileScopes: detection.fileScopes, scopes: detection.scopes, warnings: [...warnings] };
  }

  private async loadUpstream(projectId: string): Promise<FrameworkUpstreamSnapshot> {
    const [sourceCatalog, symbolRun, dependencyRun, sourceLatest, symbolLatest, dependencyLatest] = await Promise.all([
      this.sourceRepository.getCurrentReadyCatalog(projectId),
      this.symbolRepository.getCurrentCatalogRun(projectId),
      this.dependencyRepository.getCurrentCatalogRun(projectId),
      this.sourceRepository.getLatestRun(projectId),
      this.symbolRepository.getLatestRun(projectId),
      this.dependencyRepository.getLatestRun(projectId),
    ]);
    if (sourceCatalog === null || symbolRun === null || dependencyRun === null) {
      throw new ProjectFrameworkUpstreamCatalogRequiredError(projectId);
    }
    if (
      sourceLatest?.status === "running" ||
      symbolLatest?.status === "running" ||
      dependencyLatest?.status === "running" ||
      symbolRun.sourceIndexRunId !== sourceCatalog.run.id ||
      dependencyRun.sourceIndexRunId !== sourceCatalog.run.id
    ) {
      throw new ProjectFrameworkUpstreamCatalogStaleError(projectId);
    }
    return { dependencyRun, sourceCatalog, symbolRun };
  }

  private async assertUpstreamUnchanged(projectId: string, expected: FrameworkUpstreamSnapshot): Promise<void> {
    const current = await this.loadUpstream(projectId);
    if (
      current.sourceCatalog.run.id !== expected.sourceCatalog.run.id ||
      current.symbolRun.id !== expected.symbolRun.id ||
      current.dependencyRun.id !== expected.dependencyRun.id
    ) {
      throw new ProjectFrameworkUpstreamCatalogStaleError(projectId);
    }
  }

  private matchesCurrent(
    current: ProjectFrameworkIndex,
    upstream: FrameworkUpstreamSnapshot,
    analyzerSetIdentity: string,
  ): boolean {
    return (
      current.sourceIndexRunId === upstream.sourceCatalog.run.id &&
      current.symbolIndexRunId === upstream.symbolRun.id &&
      current.dependencyIndexRunId === upstream.dependencyRun.id &&
      current.analyzerSetIdentity === analyzerSetIdentity
    );
  }

  private upstreamLimitReasons(upstream: FrameworkUpstreamSnapshot): readonly ProjectFrameworkIndexLimitReason[] {
    const reasons = new Set<ProjectFrameworkIndexLimitReason>();
    if (upstream.sourceCatalog.run.status === "limited") reasons.add("source_catalog_limited");
    if (upstream.symbolRun.status === "limited") reasons.add("symbol_catalog_limited");
    if (upstream.dependencyRun.status === "limited") reasons.add("dependency_catalog_limited");
    if (upstream.symbolRun.failedFileCount > 0 || upstream.dependencyRun.failedFileCount > 0) {
      reasons.add("upstream_file_gaps");
    }
    return [...reasons];
  }

  private async loadDependencies(
    projectId: string,
    dependencyIndexId: string,
    sourceFileIds: readonly string[],
  ): Promise<ProjectFrameworkDependency[]> {
    const output: ProjectFrameworkDependency[] = [];
    const limit = this.config.projectFramework.batchSize;
    for (let offset = 0; ; offset += limit) {
      const page = await this.dependencyRepository.listCatalogDependencies({
        dependencyIndexId,
        includeBindings: true,
        limit,
        offset,
        projectId,
        sourceFileIds,
      });
      output.push(
        ...page.dependencies.map((edge) => ({
          bindings: edge.bindings.map((binding) => ({
            bindingKey: binding.bindingKey,
            importedName: binding.importedName,
            kind: binding.kind,
            localName: binding.localName,
            typeOnly: binding.typeOnly,
          })),
          externalPackage: edge.externalPackage,
          id: edge.id,
          sourceFileId: edge.sourceFileId,
          sourceRelativePath: edge.sourceRelativePath,
          specifier: edge.specifier,
          typeOnly: edge.typeOnly,
        })),
      );
      if (!page.hasMore) return output;
    }
  }

  private async loadSymbols(
    projectId: string,
    symbolIndexId: string,
    sourceFileIds: readonly string[],
  ): Promise<ProjectSymbolCatalogRecord[]> {
    const output: ProjectSymbolCatalogRecord[] = [];
    const limit = this.config.projectFramework.batchSize;
    for (let offset = 0; ; offset += limit) {
      const page = await this.symbolRepository.listCatalogSymbols({
        limit,
        offset,
        projectId,
        sourceFileIds,
        symbolIndexId,
      });
      output.push(...page.symbols);
      if (!page.hasMore) return output;
    }
  }
}

class FrameworkRunError extends Error {
  public constructor(public readonly code: ProjectFrameworkIndexErrorCode) {
    super(code);
    this.name = "FrameworkRunError";
  }
}

function toEvidenceInput(result: SourceFrameworkEvidenceExtractionResult): EvidenceInput {
  return {
    evidence: result.evidence,
    extractorIdentity: result.extractorIdentity,
    extractionOmissionCount: result.omittedEvidenceCount + result.omittedStaticValueCount,
    extractionOmissionReasons: result.omissionReasons,
    hasSyntaxErrors: result.hasSyntaxErrors,
  };
}

function taskKey(sourceFileId: string, scopeKey: string): string {
  return `${sourceFileId}\0${scopeKey}`;
}

function hash(parts: readonly string[]): string {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part).update("\0");
  return digest.digest("hex");
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
}

function mergeLimitReasons(
  left: readonly ProjectFrameworkIndexLimitReason[],
  right: readonly ProjectFrameworkIndexLimitReason[],
): readonly ProjectFrameworkIndexLimitReason[] {
  return [...new Set([...left, ...right])];
}

function isStaleSourceRead(skipReason: ProjectSourceFileSkipReason): boolean {
  return ["inventory_stale", "file_missing", "file_changed_during_read", "not_regular_file", "symbolic_link"].includes(
    skipReason,
  );
}
