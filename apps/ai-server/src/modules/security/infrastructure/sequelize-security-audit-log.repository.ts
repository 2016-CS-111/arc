import { SecurityAuditEventSchema, type SecurityAuditEvent } from "@arc/contracts";
import { Op } from "sequelize";

import type { ArcDatabase } from "../../../database/database.types.js";
import type { SecurityAuditLogRepository } from "../application/security-audit-log.repository.js";

export class SequelizeSecurityAuditLogRepository implements SecurityAuditLogRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public deleteOlderThan(cutoff: Date): Promise<number> {
    return this.database.models.securityAuditEvents.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
  }

  public async list(limit: number): Promise<readonly SecurityAuditEvent[]> {
    const rows = await this.database.models.securityAuditEvents.findAll({
      limit,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.map((row) =>
      SecurityAuditEventSchema.parse({
        action: row.action,
        category: row.category,
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        projectId: row.projectId,
        requestId: row.requestId,
        sessionId: row.sessionId,
        status: row.status,
        subjectId: row.subjectId,
      }),
    );
  }

  public async save(event: SecurityAuditEvent): Promise<void> {
    await this.database.models.securityAuditEvents.create({
      action: event.action,
      category: event.category,
      createdAt: new Date(event.createdAt),
      id: event.id,
      projectId: event.projectId,
      requestId: event.requestId,
      sessionId: event.sessionId,
      status: event.status,
      subjectId: event.subjectId,
    });
  }
}
