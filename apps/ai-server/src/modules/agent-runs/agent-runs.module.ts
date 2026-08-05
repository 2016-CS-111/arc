import { Module, type Provider } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import { AgentPlansModule } from "../agent-plans/agent-plans.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { EditsModule } from "../edits/edits.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import type { AgentRunJournalRepository } from "./application/agent-run-journal.repository.js";
import { AgentRunService } from "./application/agent-run.service.js";
import { AGENT_RUN_JOURNAL_REPOSITORY } from "./agent-runs.constants.js";
import { SequelizeAgentRunJournalRepository } from "./infrastructure/sequelize-agent-run-journal.repository.js";
import { AgentRunsController } from "./presentation/agent-runs.controller.js";

const agentRunJournalProvider: Provider<AgentRunJournalRepository> = {
  provide: AGENT_RUN_JOURNAL_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): AgentRunJournalRepository => new SequelizeAgentRunJournalRepository(database),
};

@Module({
  imports: [DatabaseModule, AgentPlansModule, ChatModule, EditsModule, TasksModule],
  controllers: [AgentRunsController],
  providers: [agentRunJournalProvider, AgentRunService],
})
export class AgentRunsModule {}
