import type { HealthAuditRetentionStatus } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import { ARC_LOGGER } from "../../logger/logger.constants.js";
import { SECURITY_AUDIT_LOG_REPOSITORY } from "../security.constants.js";
import type { SecurityAuditLogRepository } from "./security-audit-log.repository.js";

@Injectable()
export class SecurityAuditRetentionService implements OnApplicationBootstrap {
  private lastRunAt: string | null = null;
  private prunedEventCount = 0;
  private status: HealthAuditRetentionStatus["status"] = "idle";

  public constructor(
    @Inject(SECURITY_AUDIT_LOG_REPOSITORY) private readonly repository: SecurityAuditLogRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    await this.prune();
  }

  public getStatus(): HealthAuditRetentionStatus {
    return {
      lastRunAt: this.lastRunAt,
      prunedEventCount: this.prunedEventCount,
      retentionDays: this.config.security.auditRetentionDays,
      status: this.status,
    };
  }

  public async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.security.auditRetentionDays * 86_400_000);
    try {
      this.prunedEventCount = await this.repository.deleteOlderThan(cutoff);
      this.status = "completed";
      this.lastRunAt = new Date().toISOString();
    } catch (error) {
      this.status = "failed";
      this.lastRunAt = new Date().toISOString();
      this.logger.warn("Could not apply Arc security audit retention.", {
        error: error instanceof Error ? error.message : "Unknown audit retention error.",
      });
    }
  }
}
