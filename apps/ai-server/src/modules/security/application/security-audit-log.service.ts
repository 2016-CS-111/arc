import { randomUUID } from "node:crypto";

import { SecurityAuditEventSchema, type SecurityAuditEvent } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { Inject, Injectable } from "@nestjs/common";

import { ARC_LOGGER } from "../../logger/logger.constants.js";
import { SECURITY_AUDIT_LOG_REPOSITORY } from "../security.constants.js";
import type { SecurityAuditLogRepository } from "./security-audit-log.repository.js";

export type SecurityAuditLogInput = Omit<SecurityAuditEvent, "createdAt" | "id">;

@Injectable()
export class SecurityAuditLogService {
  public constructor(
    @Inject(SECURITY_AUDIT_LOG_REPOSITORY) private readonly repository: SecurityAuditLogRepository,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
  ) {}

  public record(input: SecurityAuditLogInput): void {
    const event = SecurityAuditEventSchema.parse({ ...input, createdAt: new Date().toISOString(), id: randomUUID() });
    void this.repository.save(event).catch((error: unknown) => {
      this.logger.warn("Could not persist Arc security audit event.", {
        action: event.action,
        category: event.category,
        error: error instanceof Error ? error.message : "Unknown audit persistence error.",
        id: event.id,
      });
    });
  }

  public list(limit = 100): Promise<readonly SecurityAuditEvent[]> {
    return this.repository.list(Math.min(Math.max(limit, 1), 100));
  }
}
