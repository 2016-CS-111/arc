import { Module } from "@nestjs/common";

import { LoggerModule } from "../logger/logger.module.js";
import { RealtimeGateway } from "./realtime.gateway.js";

@Module({
  imports: [LoggerModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
