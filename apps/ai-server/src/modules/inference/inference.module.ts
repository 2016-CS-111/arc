import { Module, type Provider } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { LoggerModule } from "../logger/logger.module.js";
import { CheckModelReadinessService } from "./application/check-model-readiness.service.js";
import { CHAT_MODEL, CODE_COMPLETION_MODEL } from "./inference.constants.js";
import { OllamaChatModelAdapter } from "./infrastructure/ollama/ollama.adapter.js";
import { OllamaCodeCompletionAdapter } from "./infrastructure/ollama/ollama-code-completion.adapter.js";
import { ProviderStatusController } from "./presentation/provider-status.controller.js";

const chatModelProvider: Provider = {
  provide: CHAT_MODEL,
  useClass: OllamaChatModelAdapter,
};
const codeCompletionModelProvider: Provider = {
  provide: CODE_COMPLETION_MODEL,
  useClass: OllamaCodeCompletionAdapter,
};

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [ProviderStatusController],
  providers: [chatModelProvider, codeCompletionModelProvider, CheckModelReadinessService],
  exports: [CHAT_MODEL, CODE_COMPLETION_MODEL, CheckModelReadinessService],
})
export class InferenceModule {}
