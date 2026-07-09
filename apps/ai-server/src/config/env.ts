import "dotenv/config";

import { z } from "zod";

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ARC_SERVER_HOST: z.string().min(1).default("127.0.0.1"),
  ARC_SERVER_PORT: z.coerce.number().int().positive().max(65535).default(7331),
  ARC_CORS_ORIGIN: z.string().min(1).default("*"),
});

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly corsOrigin: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.ARC_SERVER_HOST,
    port: parsed.ARC_SERVER_PORT,
    corsOrigin: parsed.ARC_CORS_ORIGIN,
  };
}
