import { OllamaProviderStatusResponseSchema, type OllamaProviderStatusResponse } from "@arc/contracts";
import { Controller, Get, Inject } from "@nestjs/common";

import { CheckModelReadinessService } from "../application/check-model-readiness.service.js";

@Controller("providers")
export class ProviderStatusController {
  public constructor(
    @Inject(CheckModelReadinessService)
    private readonly checkModelReadinessService: CheckModelReadinessService,
  ) {}

  @Get("ollama/status")
  public async getOllamaStatus(): Promise<OllamaProviderStatusResponse> {
    const status = await this.checkModelReadinessService.execute();

    return OllamaProviderStatusResponseSchema.parse({
      provider: "ollama",
      ...status,
    });
  }
}
