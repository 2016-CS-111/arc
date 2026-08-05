import type { SecurityAuditEvent } from "@arc/contracts";

export interface SecurityAuditLogRepository {
  list(limit: number): Promise<readonly SecurityAuditEvent[]>;
  save(event: SecurityAuditEvent): Promise<void>;
}
