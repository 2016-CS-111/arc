import "reflect-metadata";

import { createConsoleLogger } from "@arc/shared";

import { createDatabase } from "../database/database.sequelize.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";
import { loadConfig } from "../config/env.js";

async function main(): Promise<void> {
  const logger = createConsoleLogger("db-migrate");
  const config = loadConfig();
  const database = createDatabase(config);

  try {
    const appliedMigrations = await runMigrations(database.sequelize, await loadMigrations());
    logger.info("Database migrations are current", {
      appliedMigrations,
      database: new URL(config.database.url).pathname,
    });
  } finally {
    await database.sequelize.close();
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("db-migrate");
  logger.error("Database migration failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
