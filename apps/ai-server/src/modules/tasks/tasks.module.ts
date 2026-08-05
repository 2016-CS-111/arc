import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { SecurityModule } from "../security/security.module.js";
import { LocalTaskProcessRunner } from "./application/local-task-process.runner.js";
import { TaskProposalService } from "./application/task-proposal.service.js";
import { TaskProposalsController } from "./presentation/task-proposals.controller.js";

@Module({
  imports: [ConfigModule, ProjectsModule, SecurityModule],
  controllers: [TaskProposalsController],
  providers: [LocalTaskProcessRunner, TaskProposalService],
  exports: [TaskProposalService],
})
export class TasksModule {}
