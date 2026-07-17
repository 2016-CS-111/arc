import { Module } from "@nestjs/common";

import { ConfigModule } from "./config/config.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { InferenceModule } from "./modules/inference/inference.module.js";
import { LoggerModule } from "./modules/logger/logger.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";

@Module({
  imports: [ConfigModule, LoggerModule, HealthModule, InferenceModule, RealtimeModule],
})
export class AppModule {}
