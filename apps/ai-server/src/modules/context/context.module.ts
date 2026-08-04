import { Module } from "@nestjs/common";

import { LoggerModule } from "../logger/logger.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { ChatPromptService } from "./application/chat-prompt.service.js";
import { ChatTokenBudgetService } from "./application/chat-token-budget.service.js";
import { ProjectChatContextService } from "./application/project-chat-context.service.js";

@Module({
  imports: [LoggerModule, ProjectsModule],
  providers: [ChatPromptService, ChatTokenBudgetService, ProjectChatContextService],
  exports: [ChatPromptService],
})
export class ContextModule {}
