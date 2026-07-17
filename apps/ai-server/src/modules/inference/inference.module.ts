import { Module, type Provider } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { LoggerModule } from "../logger/logger.module.js";
import { CheckModelReadinessService } from "./application/check-model-readiness.service.js";
import { CHAT_MODEL } from "./inference.constants.js";
import { OllamaChatModelAdapter } from "./infrastructure/ollama/ollama.adapter.js";
import { ProviderStatusController } from "./presentation/provider-status.controller.js";

const chatModelProvider: Provider = {
  provide: CHAT_MODEL,
  useClass: OllamaChatModelAdapter,
};

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [ProviderStatusController],
  providers: [chatModelProvider, CheckModelReadinessService],
  exports: [CHAT_MODEL],
})
export class InferenceModule {}
