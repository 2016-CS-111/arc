import type { SecurityAuditEvent } from "@arc/contracts";

export interface SecurityAuditLogRepository {
  deleteOlderThan(cutoff: Date): Promise<number>;
  list(limit: number): Promise<readonly SecurityAuditEvent[]>;
  save(event: SecurityAuditEvent): Promise<void>;
}
