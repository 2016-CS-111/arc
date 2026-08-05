import { z } from "zod";

import { OllamaProviderStatusResponseSchema } from "./provider-status.contract.js";

export const HealthResponseSchema = z.object({
  service: z.literal("arc-ai-server"),
  status: z.literal("ok"),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export const HealthDatabaseStatusSchema = z
  .object({
    latencyMs: z.number().int().nonnegative().nullable(),
    message: z.string().min(1).optional(),
    status: z.enum(["ready", "unavailable"]),
  })
  .strict();

export const HealthAuditRetentionStatusSchema = z
  .object({
    lastRunAt: z.string().datetime().nullable(),
    prunedEventCount: z.number().int().nonnegative(),
    retentionDays: z.number().int().positive(),
    status: z.enum(["idle", "completed", "failed"]),
  })
  .strict();

export const HealthDiagnosticsResponseSchema = z
  .object({
    auditRetention: HealthAuditRetentionStatusSchema,
    database: HealthDatabaseStatusSchema,
    ollama: OllamaProviderStatusResponseSchema,
    runtime: z
      .object({
        memoryRssBytes: z.number().int().nonnegative(),
        nodeVersion: z.string().min(1),
        processId: z.number().int().positive(),
      })
      .strict(),
    service: z.literal("arc-ai-server"),
    status: z.enum(["ok", "degraded"]),
    timestamp: z.string().datetime(),
    uptimeSeconds: z.number().nonnegative(),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type HealthAuditRetentionStatus = z.infer<typeof HealthAuditRetentionStatusSchema>;
export type HealthDatabaseStatus = z.infer<typeof HealthDatabaseStatusSchema>;
export type HealthDiagnosticsResponse = z.infer<typeof HealthDiagnosticsResponseSchema>;
