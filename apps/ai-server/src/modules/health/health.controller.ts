import type { HealthResponse } from "@arc/contracts";
import { Controller, Get, Inject } from "@nestjs/common";

import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  public constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  public getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
