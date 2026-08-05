import {
  HealthDiagnosticsResponseSchema,
  type HealthDatabaseStatus,
  type HealthDiagnosticsResponse,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import type { ArcDatabase } from "../../database/database.types.js";
import { CheckModelReadinessService } from "../inference/application/check-model-readiness.service.js";
import { SecurityAuditRetentionService } from "../security/application/security-audit-retention.service.js";

@Injectable()
export class HealthDiagnosticsService {
  public constructor(
    @Inject(DATABASE) private readonly database: ArcDatabase,
    @Inject(CheckModelReadinessService) private readonly modelReadiness: CheckModelReadinessService,
    @Inject(SecurityAuditRetentionService) private readonly auditRetention: SecurityAuditRetentionService,
  ) {}

  public async getDiagnostics(): Promise<HealthDiagnosticsResponse> {
    const [database, modelStatus] = await Promise.all([this.checkDatabase(), this.modelReadiness.execute()]);
    return HealthDiagnosticsResponseSchema.parse({
      auditRetention: this.auditRetention.getStatus(),
      database,
      ollama: { provider: "ollama", ...modelStatus },
      runtime: {
        memoryRssBytes: process.memoryUsage().rss,
        nodeVersion: process.version,
        processId: process.pid,
      },
      service: "arc-ai-server",
      status: database.status === "ready" && modelStatus.status === "ready" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    });
  }

  private async checkDatabase(): Promise<HealthDatabaseStatus> {
    const startedAt = performance.now();
    try {
      await this.database.sequelize.authenticate();
      return { latencyMs: Math.round(performance.now() - startedAt), status: "ready" };
    } catch {
      return {
        latencyMs: Math.round(performance.now() - startedAt),
        message: "PostgreSQL is unavailable.",
        status: "unavailable",
      };
    }
  }
}
