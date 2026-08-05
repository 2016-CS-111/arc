import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { InferenceModule } from "../inference/inference.module.js";
import { SecurityModule } from "../security/security.module.js";
import { HealthController } from "./health.controller.js";
import { HealthDiagnosticsService } from "./health-diagnostics.service.js";
import { HealthService } from "./health.service.js";

@Module({
  imports: [DatabaseModule, InferenceModule, SecurityModule],
  controllers: [HealthController],
  providers: [HealthService, HealthDiagnosticsService],
})
export class HealthModule {}
