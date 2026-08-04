import {
  LatestProjectSourceIndexResponseSchema,
  type LatestProjectSourceIndexResponse,
  type ProjectFileMetadata,
  type ProjectSourceFileSkipReason,
  type ProjectSourceIndex,
  type ProjectSourceIndexErrorCode,
} from "@arc/contracts";
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import {
  PROJECT_INVENTORY_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  SOURCE_TEXT_READER,
} from "../projects.constants.js";
import type { ProjectSourceFileOutcome } from "../domain/project-source-index.types.js";
import {
  ProjectInventoryRequiredError,
  ProjectNotFoundError,
  ProjectSourceIndexFailedError,
} from "../domain/project.errors.js";
import { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import { SourceLanguageClassifier } from "./source-language.classifier.js";
import type { SourceTextReader } from "./source-text.reader.js";

@Injectable()
export class ProjectSourceIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectSourceIndexService.name);

  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_INVENTORY_REPOSITORY)
    private readonly inventoryRepository: ProjectInventoryRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY)
    private readonly sourceIndexRepository: ProjectSourceIndexRepository,
    @Inject(SOURCE_TEXT_READER)
    private readonly sourceTextReader: SourceTextReader,
    @Inject(ProjectIgnorePolicyService)
    private readonly ignorePolicy: ProjectIgnorePolicyService,
    @Inject(SourceLanguageClassifier)
    private readonly languageClassifier: SourceLanguageClassifier,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const recoveredCount = await this.sourceIndexRepository.recoverInterruptedIndexes();
      if (recoveredCount > 0) {
        this.logger.warn("Recovered interrupted Arc project source indexes.", { recoveredCount });
      }
    } catch {
      this.logger.warn("Could not recover interrupted Arc project source indexes.");
    }
  }

  public async index(projectId: string): Promise<ProjectSourceIndex> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const inventory = await this.inventoryRepository.getCurrentSnapshot(projectId);
    if (inventory === null) {
      throw new ProjectInventoryRequiredError(projectId);
    }

    const run = await this.sourceIndexRepository.beginIndex(projectId, inventory.scan.id);
    const evaluator = this.ignorePolicy.createEvaluator(project);
    const outcomes: ProjectSourceFileOutcome[] = [];
    let inspectedBytes = 0;
    let readyBytes = 0;
    let readyFileCount = 0;
    let skippedFileCount = 0;
    let limitReached = false;

    try {
      for (const file of inventory.files) {
        let outcome: ProjectSourceFileOutcome;
        if (limitReached) {
          outcome = this.skippedOutcome(file, "run_limit");
        } else {
          const ignoreDecision = await evaluator.check({ kind: "file", path: file.path });
          if (ignoreDecision.ignored) {
            outcome = this.skippedOutcome(file, "ignored_since_scan");
          } else if (
            file.sizeBytes <= this.config.projectSource.maxFileBytes &&
            inspectedBytes + file.sizeBytes > this.config.projectSource.maxTotalBytes
          ) {
            limitReached = true;
            outcome = this.skippedOutcome(file, "run_limit");
          } else {
            const result = await this.sourceTextReader.inspect({
              file,
              maxFileBytes: Math.min(
                this.config.projectSource.maxFileBytes,
                this.config.projectSource.maxTotalBytes - inspectedBytes,
              ),
              rootPath: project.rootPath,
            });
            inspectedBytes += result.inspectedBytes;
            outcome =
              result.status === "ready"
                ? {
                    contentHash: result.contentHash,
                    inspectedBytes: result.inspectedBytes,
                    language: this.languageClassifier.classify(file.path),
                    modifiedAt: result.modifiedAt,
                    relativePath: file.path,
                    sizeBytes: result.sizeBytes,
                    skipReason: null,
                    status: "ready",
                  }
                : {
                    contentHash: null,
                    inspectedBytes: result.inspectedBytes,
                    language: null,
                    modifiedAt: result.modifiedAt,
                    relativePath: file.path,
                    sizeBytes: result.sizeBytes,
                    skipReason: result.skipReason,
                    status: "skipped",
                  };
          }
        }

        outcomes.push(outcome);
        if (outcome.status === "ready") {
          readyFileCount += 1;
          readyBytes += outcome.sizeBytes;
        } else {
          skippedFileCount += 1;
        }
      }
    } catch {
      await this.recordFailure(run, "filesystem_error");
      throw new ProjectSourceIndexFailedError();
    }

    try {
      return await this.sourceIndexRepository.completeIndex({
        batchSize: this.config.projectSource.batchSize,
        files: outcomes,
        inspectedBytes,
        inventoryScanId: inventory.scan.id,
        limitReasons: limitReached ? ["total_bytes"] : [],
        projectId,
        readyBytes,
        readyFileCount,
        skippedFileCount,
        sourceIndexId: run.id,
      });
    } catch {
      await this.recordFailure(run, "source_persistence_error");
      throw new ProjectSourceIndexFailedError();
    }
  }

  public async getLatest(projectId: string): Promise<LatestProjectSourceIndexResponse> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const [latestRun, currentCatalogRun, inventory] = await Promise.all([
      this.sourceIndexRepository.getLatestRun(projectId),
      this.sourceIndexRepository.getCurrentCatalogRun(projectId),
      this.inventoryRepository.getCurrentSnapshot(projectId),
    ]);

    return LatestProjectSourceIndexResponseSchema.parse({
      currentCatalog:
        currentCatalogRun === null
          ? null
          : {
              completedAt: currentCatalogRun.completedAt,
              inspectedBytes: currentCatalogRun.inspectedBytes,
              inventoryScanId: currentCatalogRun.inventoryScanId,
              readyBytes: currentCatalogRun.readyBytes,
              readyFileCount: currentCatalogRun.readyFileCount,
              skippedFileCount: currentCatalogRun.skippedFileCount,
              sourceIndexId: currentCatalogRun.id,
              stale: inventory?.scan.id !== currentCatalogRun.inventoryScanId,
            },
      latestRun,
    });
  }

  private skippedOutcome(file: ProjectFileMetadata, skipReason: ProjectSourceFileSkipReason): ProjectSourceFileOutcome {
    return {
      contentHash: null,
      inspectedBytes: 0,
      language: null,
      modifiedAt: file.modifiedAt,
      relativePath: file.path,
      sizeBytes: file.sizeBytes,
      skipReason,
      status: "skipped",
    };
  }

  private async recordFailure(run: ProjectSourceIndex, errorCode: ProjectSourceIndexErrorCode): Promise<void> {
    try {
      await this.sourceIndexRepository.failIndex({
        errorCode,
        projectId: run.projectId,
        sourceIndexId: run.id,
      });
    } catch {
      this.logger.error("Arc could not persist project source index failure state.", {
        projectId: run.projectId,
        sourceIndexId: run.id,
      });
    }
  }
}
