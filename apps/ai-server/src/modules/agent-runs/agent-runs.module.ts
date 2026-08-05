import { Module } from "@nestjs/common";

import { AgentPlansModule } from "../agent-plans/agent-plans.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { EditsModule } from "../edits/edits.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { AgentRunService } from "./application/agent-run.service.js";
import { AgentRunsController } from "./presentation/agent-runs.controller.js";

@Module({
  imports: [AgentPlansModule, ChatModule, EditsModule, TasksModule],
  controllers: [AgentRunsController],
  providers: [AgentRunService],
})
export class AgentRunsModule {}
