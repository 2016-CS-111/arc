import type { SecurityAuditEvent, SecurityStatus } from "@arc/contracts";
import { Controller, Get, Inject, Query } from "@nestjs/common";

import { PermissionProfileService } from "../application/permission-profile.service.js";
import { SecurityAuditLogService } from "../application/security-audit-log.service.js";

@Controller("security")
export class SecurityController {
  public constructor(
    @Inject(PermissionProfileService) private readonly permissions: PermissionProfileService,
    @Inject(SecurityAuditLogService) private readonly auditLog: SecurityAuditLogService,
  ) {}

  @Get()
  public getStatus(): SecurityStatus {
    return { permissionProfile: this.permissions.getProfile() };
  }

  @Get("audit")
  public listAudit(@Query("limit") limit: string | undefined): Promise<readonly SecurityAuditEvent[]> {
    return this.auditLog.list(parseLimit(limit));
  }
}

function parseLimit(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 100;
}
