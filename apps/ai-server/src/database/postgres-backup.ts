import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface PostgresConnectionOptions {
  readonly environment: NodeJS.ProcessEnv;
}

export function createBackupPath(directory: string, now = new Date()): string {
  const timestamp = now.toISOString().replaceAll(/[:.]/gu, "-");
  return join(directory, `arc-${timestamp}.dump`);
}

export function createPostgresConnectionOptions(databaseUrl: string): PostgresConnectionOptions {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (database.length === 0) {
    throw new Error("ARC_DATABASE_URL must include a PostgreSQL database name.");
  }

  return {
    environment: {
      PGDATABASE: database,
      PGHOST: url.hostname,
      ...(url.password.length === 0 ? {} : { PGPASSWORD: decodeURIComponent(url.password) }),
      ...(url.port.length === 0 ? {} : { PGPORT: url.port }),
      ...(url.username.length === 0 ? {} : { PGUSER: decodeURIComponent(url.username) }),
      ...(url.searchParams.has("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode") ?? undefined } : {}),
    },
  };
}

export function assertDatabaseRestoreConfirmed(value: string | undefined): void {
  if (value !== "true") {
    throw new Error("Set ARC_DATABASE_RESTORE_CONFIRMED=true to restore the configured database.");
  }
}

export async function backupPostgres(databaseUrl: string, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const filePath = createBackupPath(directory);
  await runPostgresCommand(
    "pg_dump",
    ["--format=custom", "--file", filePath],
    createPostgresConnectionOptions(databaseUrl),
  );
  return filePath;
}

export async function restorePostgres(databaseUrl: string, filePath: string): Promise<void> {
  const source = await stat(filePath);
  if (!source.isFile()) {
    throw new Error("Arc database restore requires a backup file.");
  }
  await runPostgresCommand(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", filePath],
    createPostgresConnectionOptions(databaseUrl),
  );
}

function runPostgresCommand(
  executable: "pg_dump" | "pg_restore",
  args: readonly string[],
  options: PostgresConnectionOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: { ...process.env, ...options.environment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${executable} exited with code ${String(code)}.`));
    });
  });
}
