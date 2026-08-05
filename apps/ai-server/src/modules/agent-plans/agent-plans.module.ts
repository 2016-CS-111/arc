import { Module } from "@nestjs/common";

import { InferenceModule } from "../inference/inference.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { AgentPlanGenerationService } from "./application/agent-plan-generation.service.js";
import { AgentPlanService } from "./application/agent-plan.service.js";
import { AgentPlansController } from "./presentation/agent-plans.controller.js";

@Module({
  imports: [InferenceModule, ProjectsModule],
  controllers: [AgentPlansController],
  providers: [AgentPlanGenerationService, AgentPlanService],
  exports: [AgentPlanService],
})
export class AgentPlansModule {}
