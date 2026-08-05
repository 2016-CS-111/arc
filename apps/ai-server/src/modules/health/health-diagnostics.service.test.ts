import { HealthDiagnosticsResponseSchema } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ArcDatabase } from "../../database/database.types.js";
import type { CheckModelReadinessService } from "../inference/application/check-model-readiness.service.js";
import type { SecurityAuditRetentionService } from "../security/application/security-audit-retention.service.js";
import { HealthDiagnosticsService } from "./health-diagnostics.service.js";

describe("HealthDiagnosticsService", () => {
  it("reports structured readiness for PostgreSQL, Ollama, and audit retention", async () => {
    const service = createService();
    const diagnostics = await service.getDiagnostics();

    expect(HealthDiagnosticsResponseSchema.parse(diagnostics)).toEqual(diagnostics);
    expect(diagnostics).toMatchObject({
      database: { status: "ready" },
      ollama: { provider: "ollama", status: "ready" },
      status: "ok",
    });
  });

  it("degrades without disclosing PostgreSQL errors", async () => {
    const service = createService({ databaseError: new Error("password=secret") });

    await expect(service.getDiagnostics()).resolves.toMatchObject({
      database: { message: "PostgreSQL is unavailable.", status: "unavailable" },
      status: "degraded",
    });
  });
});

function createService(options: { readonly databaseError?: Error } = {}): HealthDiagnosticsService {
  const authenticate =
    options.databaseError === undefined
      ? vi.fn(() => Promise.resolve())
      : vi.fn(() => Promise.reject(options.databaseError));
  return new HealthDiagnosticsService(
    { sequelize: { authenticate } } as unknown as ArcDatabase,
    {
      execute: () => Promise.resolve({ latencyMs: 3, model: "qwen2.5-coder:7b", status: "ready" }),
    } as unknown as CheckModelReadinessService,
    {
      getStatus: () => ({ lastRunAt: null, prunedEventCount: 0, retentionDays: 90, status: "completed" }),
    } as unknown as SecurityAuditRetentionService,
  );
}
