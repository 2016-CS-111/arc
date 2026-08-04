import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { InferenceModule } from "../inference/inference.module.js";
import { CodeCompletionService } from "./application/code-completion.service.js";
import { CodeCompletionsController } from "./presentation/code-completions.controller.js";

@Module({
  imports: [ConfigModule, InferenceModule],
  controllers: [CodeCompletionsController],
  providers: [CodeCompletionService],
})
export class CompletionsModule {}
