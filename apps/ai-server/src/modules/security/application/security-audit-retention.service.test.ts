import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../../config/env.js";
import type { SecurityAuditLogRepository } from "./security-audit-log.repository.js";
import { SecurityAuditRetentionService } from "./security-audit-retention.service.js";

describe("SecurityAuditRetentionService", () => {
  it("prunes expired audit metadata without blocking backend startup", async () => {
    const deleteOlderThan = vi.fn(() => Promise.resolve(4));
    const service = new SecurityAuditRetentionService(
      { deleteOlderThan } as unknown as SecurityAuditLogRepository,
      { security: { auditRetentionDays: 30 } } as AppConfig,
      logger,
    );

    await service.onApplicationBootstrap();

    expect(deleteOlderThan).toHaveBeenCalledOnce();
    expect(service.getStatus()).toMatchObject({ prunedEventCount: 4, retentionDays: 30, status: "completed" });
  });
});

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};
