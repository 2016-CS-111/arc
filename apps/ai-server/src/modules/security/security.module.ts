import { Module, type Provider } from "@nestjs/common";

import { APP_CONFIG } from "../../config/config.constants.js";
import type { AppConfig } from "../../config/env.js";
import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import { LoggerModule } from "../logger/logger.module.js";
import { PermissionProfileService } from "./application/permission-profile.service.js";
import type { SecurityAuditLogRepository } from "./application/security-audit-log.repository.js";
import { SecurityAuditLogService } from "./application/security-audit-log.service.js";
import { SecurityAuditRetentionService } from "./application/security-audit-retention.service.js";
import { SequelizeSecurityAuditLogRepository } from "./infrastructure/sequelize-security-audit-log.repository.js";
import { SecurityController } from "./presentation/security.controller.js";
import { SECURITY_AUDIT_LOG_REPOSITORY } from "./security.constants.js";

const permissionProfileProvider: Provider<PermissionProfileService> = {
  provide: PermissionProfileService,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): PermissionProfileService =>
    new PermissionProfileService(config.security.permissionProfile),
};

const securityAuditLogRepositoryProvider: Provider<SecurityAuditLogRepository> = {
  provide: SECURITY_AUDIT_LOG_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): SecurityAuditLogRepository => new SequelizeSecurityAuditLogRepository(database),
};

@Module({
  imports: [DatabaseModule, LoggerModule],
  controllers: [SecurityController],
  providers: [
    permissionProfileProvider,
    securityAuditLogRepositoryProvider,
    SecurityAuditLogService,
    SecurityAuditRetentionService,
  ],
  exports: [PermissionProfileService, SecurityAuditLogService, SecurityAuditRetentionService],
})
export class SecurityModule {}
