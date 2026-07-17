import { Module } from "@nestjs/common";

import { HealthModule } from "./modules/health/health.module.js";
import { LoggerModule } from "./modules/logger/logger.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";

@Module({
  imports: [LoggerModule, HealthModule, RealtimeModule],
})
export class AppModule {}
