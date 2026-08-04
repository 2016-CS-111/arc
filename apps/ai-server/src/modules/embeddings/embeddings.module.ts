import { Module, type Provider } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { EMBEDDING_MODEL } from "./embeddings.constants.js";
import { OllamaEmbeddingModelAdapter } from "./infrastructure/ollama/ollama-embedding.adapter.js";
import { EmbeddingProviderStatusController } from "./presentation/embedding-provider-status.controller.js";

const embeddingModelProvider: Provider = {
  provide: EMBEDDING_MODEL,
  useClass: OllamaEmbeddingModelAdapter,
};

@Module({
  imports: [ConfigModule],
  controllers: [EmbeddingProviderStatusController],
  providers: [embeddingModelProvider],
  exports: [EMBEDDING_MODEL],
})
export class EmbeddingsModule {}
