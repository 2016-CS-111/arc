import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { QueryTypes, type Sequelize } from "sequelize";

export interface SqlMigration {
  readonly name: string;
  readonly sql: string;
}

interface MigrationRow {
  readonly name: string;
}

const migrationFilePattern = /^\d{4}_[a-z0-9_]+\.sql$/;

export async function loadMigrations(directory = getDefaultMigrationDirectory()): Promise<SqlMigration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isFile() && migrationFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    migrationNames.map(async (name) => ({
      name,
      sql: await readFile(resolve(directory, name), "utf8"),
    })),
  );
}

export async function runMigrations(sequelize: Sequelize, migrations: readonly SqlMigration[]): Promise<string[]> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS arc_schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const appliedRows = await sequelize.query<MigrationRow>("SELECT name FROM arc_schema_migrations", {
    type: QueryTypes.SELECT,
  });
  const appliedNames = new Set(appliedRows.map((row) => row.name));
  const pendingMigrations = migrations.filter((migration) => !appliedNames.has(migration.name));

  for (const migration of pendingMigrations) {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(migration.sql, { transaction });
      await sequelize.query("INSERT INTO arc_schema_migrations (name) VALUES ($1)", {
        bind: [migration.name],
        transaction,
      });
    });
  }

  return pendingMigrations.map((migration) => migration.name);
}

function getDefaultMigrationDirectory(): string {
  return resolve(fileURLToPath(new URL("../../migrations", import.meta.url)));
}

export function getMigrationName(path: string): string {
  return basename(path);
}
