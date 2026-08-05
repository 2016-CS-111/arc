import { Module } from "@nestjs/common";

import { AgentPlansModule } from "../agent-plans/agent-plans.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { AgentRunService } from "./application/agent-run.service.js";
import { AgentRunsController } from "./presentation/agent-runs.controller.js";

@Module({
  imports: [AgentPlansModule, ChatModule],
  controllers: [AgentRunsController],
  providers: [AgentRunService],
})
export class AgentRunsModule {}
