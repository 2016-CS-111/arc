import {
  LatestProjectScanResponseSchema,
  type LatestProjectScanResponse,
  type ProjectScan,
  type ProjectScanErrorCode,
} from "@arc/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import {
  PROJECT_INVENTORY_REPOSITORY,
  PROJECT_REPOSITORY,
  REPOSITORY_INVENTORY_WALKER,
} from "../projects.constants.js";
import { ProjectNotFoundError, ProjectScanFailedError } from "../domain/project.errors.js";
import { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { RepositoryInventoryWalker } from "./repository-inventory.walker.js";

@Injectable()
export class ProjectInventoryService {
  private readonly logger = new Logger(ProjectInventoryService.name);

  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_INVENTORY_REPOSITORY)
    private readonly inventoryRepository: ProjectInventoryRepository,
    @Inject(REPOSITORY_INVENTORY_WALKER)
    private readonly inventoryWalker: RepositoryInventoryWalker,
    @Inject(ProjectIgnorePolicyService)
    private readonly ignorePolicy: ProjectIgnorePolicyService,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async scan(projectId: string): Promise<ProjectScan> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const scan = await this.inventoryRepository.beginScan(projectId);
    const ignoreEvaluator = this.ignorePolicy.createEvaluator(project);
    let inventory;

    try {
      inventory = await this.inventoryWalker.walk(project.rootPath, ignoreEvaluator, {
        maxDepth: this.config.projectScan.maxDepth,
        maxFiles: this.config.projectScan.maxFiles,
        maxTotalBytes: this.config.projectScan.maxTotalBytes,
      });
    } catch {
      await this.recordFailure(scan, "filesystem_error");
      throw new ProjectScanFailedError();
    }

    try {
      return await this.inventoryRepository.completeScan({
        ...inventory,
        batchSize: this.config.projectScan.batchSize,
        projectId,
        scanId: scan.id,
      });
    } catch {
      await this.recordFailure(scan, "inventory_persistence_error");
      throw new ProjectScanFailedError();
    }
  }

  public async getLatestScan(projectId: string): Promise<LatestProjectScanResponse> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    return LatestProjectScanResponseSchema.parse({
      scan: await this.inventoryRepository.getLatestScan(projectId),
    });
  }

  private async recordFailure(scan: ProjectScan, errorCode: ProjectScanErrorCode): Promise<void> {
    try {
      await this.inventoryRepository.failScan({
        errorCode,
        projectId: scan.projectId,
        scanId: scan.id,
      });
    } catch {
      this.logger.error("Arc could not persist project inventory failure state.", {
        projectId: scan.projectId,
        scanId: scan.id,
      });
    }
  }
}
