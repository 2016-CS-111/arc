import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config/env.js";
import type { ArcDatabase } from "./database.types.js";
import { DatabaseLifecycle } from "./database.lifecycle.js";

function createConfig(sync: boolean): AppConfig {
  return {
    corsOrigin: "*",
    database: {
      connectTimeoutMs: 5_000,
      sync,
      url: "postgresql://postgres:postgres@127.0.0.1:5432/arc",
    },
    host: "127.0.0.1",
    nodeEnv: "test",
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
      requestTimeoutMs: 300_000,
      readinessTimeoutMs: 5_000,
    },
    port: 7331,
  };
}

function createDatabase(): {
  readonly database: ArcDatabase;
  readonly authenticate: ReturnType<typeof vi.fn>;
  readonly sync: ReturnType<typeof vi.fn>;
} {
  const authenticate = vi.fn().mockResolvedValue(undefined);
  const sync = vi.fn().mockResolvedValue(undefined);

  return {
    authenticate,
    database: {
      sequelize: { authenticate, sync },
    } as unknown as ArcDatabase,
    sync,
  };
}

describe("DatabaseLifecycle", () => {
  it("synchronizes Sequelize models only when explicitly enabled", async () => {
    const { authenticate, database, sync } = createDatabase();
    const lifecycle = new DatabaseLifecycle(database, createConfig(true));

    await lifecycle.onApplicationBootstrap();

    expect(authenticate).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledOnce();
  });

  it("does not synchronize models when the database sync flag is disabled", async () => {
    const { database, sync } = createDatabase();
    const lifecycle = new DatabaseLifecycle(database, createConfig(false));

    await lifecycle.onApplicationBootstrap();

    expect(sync).not.toHaveBeenCalled();
  });
});
