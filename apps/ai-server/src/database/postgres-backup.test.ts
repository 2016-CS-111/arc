import { describe, expect, it } from "vitest";

import {
  assertDatabaseRestoreConfirmed,
  createBackupPath,
  createPostgresConnectionOptions,
} from "./postgres-backup.js";

describe("PostgreSQL backup helpers", () => {
  it("creates a compact timestamped backup path", () => {
    expect(createBackupPath("/tmp/arc-backups", new Date("2026-08-05T00:00:00.000Z"))).toBe(
      "/tmp/arc-backups/arc-2026-08-05T00-00-00-000Z.dump",
    );
  });

  it("maps the configured PostgreSQL URL to libpq environment variables", () => {
    expect(createPostgresConnectionOptions("postgresql://arc:secret@127.0.0.1:5433/arc?sslmode=require")).toEqual({
      environment: {
        PGDATABASE: "arc",
        PGHOST: "127.0.0.1",
        PGPASSWORD: "secret",
        PGPORT: "5433",
        PGSSLMODE: "require",
        PGUSER: "arc",
      },
    });
  });

  it("requires explicit confirmation before a restore", () => {
    expect(() => assertDatabaseRestoreConfirmed(undefined)).toThrow("ARC_DATABASE_RESTORE_CONFIRMED=true");
    expect(() => assertDatabaseRestoreConfirmed("true")).not.toThrow();
  });
});
