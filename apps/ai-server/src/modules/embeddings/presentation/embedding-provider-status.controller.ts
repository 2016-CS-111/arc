import { EmbeddingProviderStatusResponseSchema, type EmbeddingProviderStatusResponse } from "@arc/contracts";
import { Controller, Get, Inject } from "@nestjs/common";

import type { EmbeddingModelPort } from "../application/embedding-model.port.js";
import { EMBEDDING_MODEL } from "../embeddings.constants.js";

@Controller("providers/ollama/embeddings")
export class EmbeddingProviderStatusController {
  public constructor(@Inject(EMBEDDING_MODEL) private readonly embeddingModel: EmbeddingModelPort) {}

  @Get("status")
  public async getStatus(): Promise<EmbeddingProviderStatusResponse> {
    return EmbeddingProviderStatusResponseSchema.parse({
      provider: "ollama",
      ...(await this.embeddingModel.getStatus()),
    });
  }
}
