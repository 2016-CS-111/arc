import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";

import { loadMigrations, runMigrations } from "./migration-runner.js";

const temporaryDirectories: string[] = [];

class FakeMigrationClient {
  public readonly appliedMigrations = new Set<string>();
  public readonly queries: { readonly text: string; readonly values: readonly unknown[] | undefined }[] = [];
  public released = false;

  public query(text: string, values?: readonly unknown[]): Promise<{ readonly rows: readonly { name: string }[] }> {
    this.queries.push({ text, ...(values === undefined ? {} : { values }) });

    if (text === "SELECT name FROM arc_schema_migrations") {
      return Promise.resolve({
        rows: [...this.appliedMigrations].map((name) => ({ name })),
      });
    }

    if (text === "INSERT INTO arc_schema_migrations (name) VALUES ($1)") {
      const migrationName = values?.[0];
      if (typeof migrationName !== "string") {
        throw new Error("Migration name was not supplied.");
      }

      this.appliedMigrations.add(migrationName);
    }

    return Promise.resolve({ rows: [] });
  }

  public release(): void {
    this.released = true;
  }
}

function createPool(client: FakeMigrationClient): Pool {
  return {
    connect: (): Promise<FakeMigrationClient> => Promise.resolve(client),
  } as unknown as Pool;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("loadMigrations", () => {
  it("loads only valid migration files in lexical order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arc-migrations-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "0002_add_messages.sql"), "SELECT 2;");
    await writeFile(join(directory, "0001_create_sessions.sql"), "SELECT 1;");
    await writeFile(join(directory, "notes.sql"), "SELECT 3;");

    await expect(loadMigrations(directory)).resolves.toEqual([
      { name: "0001_create_sessions.sql", sql: "SELECT 1;" },
      { name: "0002_add_messages.sql", sql: "SELECT 2;" },
    ]);
  });

  it("applies each pending migration once in a transaction", async () => {
    const client = new FakeMigrationClient();
    const migrations = [
      { name: "0001_create_sessions.sql", sql: "CREATE TABLE chat_sessions ();" },
      { name: "0002_create_messages.sql", sql: "CREATE TABLE chat_messages ();" },
    ];

    await expect(runMigrations(createPool(client), migrations)).resolves.toEqual([
      "0001_create_sessions.sql",
      "0002_create_messages.sql",
    ]);
    await expect(runMigrations(createPool(client), migrations)).resolves.toEqual([]);

    expect(client.queries.map((query) => query.text)).toEqual([
      expect.stringContaining("CREATE TABLE IF NOT EXISTS arc_schema_migrations"),
      "SELECT name FROM arc_schema_migrations",
      "BEGIN",
      "CREATE TABLE chat_sessions ();",
      "INSERT INTO arc_schema_migrations (name) VALUES ($1)",
      "COMMIT",
      "BEGIN",
      "CREATE TABLE chat_messages ();",
      "INSERT INTO arc_schema_migrations (name) VALUES ($1)",
      "COMMIT",
      expect.stringContaining("CREATE TABLE IF NOT EXISTS arc_schema_migrations"),
      "SELECT name FROM arc_schema_migrations",
    ]);
    expect(client.released).toBe(true);
  });
});
