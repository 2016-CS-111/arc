import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.literal("arc-ai-server"),
  status: z.literal("ok"),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
