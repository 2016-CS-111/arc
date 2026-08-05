import type { HealthDiagnosticsResponse, HealthResponse } from "@arc/contracts";
import { Controller, Get, Inject } from "@nestjs/common";

import { HealthService } from "./health.service.js";
import { HealthDiagnosticsService } from "./health-diagnostics.service.js";

@Controller("health")
export class HealthController {
  public constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
    @Inject(HealthDiagnosticsService) private readonly diagnostics: HealthDiagnosticsService,
  ) {}

  @Get()
  public getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }

  @Get("diagnostics")
  public getDiagnostics(): Promise<HealthDiagnosticsResponse> {
    return this.diagnostics.getDiagnostics();
  }
}
