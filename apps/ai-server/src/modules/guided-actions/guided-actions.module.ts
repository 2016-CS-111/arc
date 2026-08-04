import { Module } from "@nestjs/common";

import { ChatModule } from "../chat/chat.module.js";
import { EditsModule } from "../edits/edits.module.js";
import { InferenceModule } from "../inference/inference.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { GuidedCodeActionService } from "./application/guided-code-action.service.js";
import { GuidedCodeActionsController } from "./presentation/guided-code-actions.controller.js";

@Module({
  imports: [ChatModule, EditsModule, InferenceModule, TasksModule],
  controllers: [GuidedCodeActionsController],
  providers: [GuidedCodeActionService],
})
export class GuidedActionsModule {}
