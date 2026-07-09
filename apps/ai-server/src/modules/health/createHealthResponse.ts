import type { HealthResponse } from "@arc/contracts";

export function createHealthResponse(): HealthResponse {
  return {
    service: "arc-ai-server",
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}
