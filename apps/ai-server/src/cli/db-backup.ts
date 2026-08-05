import "reflect-metadata";

import { createConsoleLogger } from "@arc/shared";

import { backupPostgres } from "../database/postgres-backup.js";
import { loadConfig } from "../config/env.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const filePath = await backupPostgres(config.database.url, config.backups.directory);
  createConsoleLogger("db-backup").info("Arc PostgreSQL backup completed", { filePath });
}

main().catch((error: unknown) => {
  createConsoleLogger("db-backup").error("Arc PostgreSQL backup failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
