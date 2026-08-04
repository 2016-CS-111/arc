import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { ProjectEditProposalService } from "./application/project-edit-proposal.service.js";
import { EditProposalsController } from "./presentation/edit-proposals.controller.js";

@Module({
  imports: [ConfigModule, ProjectsModule],
  controllers: [EditProposalsController],
  providers: [ProjectEditProposalService],
  exports: [ProjectEditProposalService],
})
export class EditsModule {}
