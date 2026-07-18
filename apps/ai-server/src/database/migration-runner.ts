import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

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

export async function runMigrations(pool: Pool, migrations: readonly SqlMigration[]): Promise<string[]> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS arc_schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const appliedResult = await client.query<MigrationRow>("SELECT name FROM arc_schema_migrations");
    const appliedNames = new Set(appliedResult.rows.map((row) => row.name));
    const pendingMigrations = migrations.filter((migration) => !appliedNames.has(migration.name));

    for (const migration of pendingMigrations) {
      await client.query("BEGIN");

      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO arc_schema_migrations (name) VALUES ($1)", [migration.name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return pendingMigrations.map((migration) => migration.name);
  } finally {
    client.release();
  }
}

function getDefaultMigrationDirectory(): string {
  return resolve(fileURLToPath(new URL("../../migrations", import.meta.url)));
}

export function getMigrationName(path: string): string {
  return basename(path);
}
