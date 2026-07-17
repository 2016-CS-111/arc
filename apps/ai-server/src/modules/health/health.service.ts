import type { HealthResponse } from "@arc/contracts";
import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  public getHealth(): HealthResponse {
    return {
      service: "arc-ai-server",
      status: "ok",
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
