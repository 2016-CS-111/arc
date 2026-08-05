import "reflect-metadata";

import { resolve } from "node:path";

import { createConsoleLogger } from "@arc/shared";

import { loadConfig } from "../config/env.js";
import { assertDatabaseRestoreConfirmed, restorePostgres } from "../database/postgres-backup.js";

async function main(): Promise<void> {
  assertDatabaseRestoreConfirmed(process.env.ARC_DATABASE_RESTORE_CONFIRMED);
  const source = process.argv[2];
  if (source === undefined || source.trim().length === 0) {
    throw new Error("Provide the PostgreSQL backup file path to restore.");
  }

  const config = loadConfig();
  const filePath = resolve(source);
  await restorePostgres(config.database.url, filePath);
  createConsoleLogger("db-restore").info("Arc PostgreSQL restore completed", { filePath });
}

main().catch((error: unknown) => {
  createConsoleLogger("db-restore").error("Arc PostgreSQL restore failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
