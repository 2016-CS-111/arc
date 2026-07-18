import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

loadDotenv({ path: resolve(workspaceRoot, ".env"), quiet: true });

const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "ARC_DATABASE_URL must use the postgres or postgresql protocol.");

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ARC_SERVER_HOST: z.string().min(1).default("127.0.0.1"),
  ARC_SERVER_PORT: z.coerce.number().int().positive().max(65535).default(7331),
  ARC_CORS_ORIGIN: z.string().min(1).default("*"),
  ARC_DATABASE_URL: databaseUrlSchema.default("postgresql://postgres:postgres@127.0.0.1:5432/arc"),
  ARC_DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
  ARC_DATABASE_SYNC: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ARC_OLLAMA_BASE_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, ""))
    .default("http://127.0.0.1:11434"),
  ARC_OLLAMA_MODEL: z.string().trim().min(1).optional(),
  ARC_OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(900_000).default(300_000),
  ARC_OLLAMA_READINESS_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
});

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly corsOrigin: string;
  readonly database: {
    readonly url: string;
    readonly connectTimeoutMs: number;
    readonly sync: boolean;
  };
  readonly ollama: {
    readonly baseUrl: string;
    readonly model?: string;
    readonly requestTimeoutMs: number;
    readonly readinessTimeoutMs: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.parse(env);

  const ollama = {
    baseUrl: parsed.ARC_OLLAMA_BASE_URL,
    requestTimeoutMs: parsed.ARC_OLLAMA_REQUEST_TIMEOUT_MS,
    readinessTimeoutMs: parsed.ARC_OLLAMA_READINESS_TIMEOUT_MS,
    ...(parsed.ARC_OLLAMA_MODEL === undefined ? {} : { model: parsed.ARC_OLLAMA_MODEL }),
  };

  const database = {
    url: parsed.ARC_DATABASE_URL,
    connectTimeoutMs: parsed.ARC_DATABASE_CONNECT_TIMEOUT_MS,
    sync: parsed.ARC_DATABASE_SYNC,
  };

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.ARC_SERVER_HOST,
    port: parsed.ARC_SERVER_PORT,
    corsOrigin: parsed.ARC_CORS_ORIGIN,
    database,
    ollama,
  };
}
