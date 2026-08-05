# Milestone 16.2 Acceptance

## Automated Evidence

- The diagnostics contract validates ready and degraded PostgreSQL/Ollama states without returning
  database error text.
- Audit retention reports its completed or failed startup state and does not make backend startup
  fail when cleanup is unavailable.
- Backup helpers create timestamped custom-format paths and map the configured PostgreSQL URL to
  libpq environment variables without placing passwords in command arguments.
- Existing workflow tests continue to cover their durable restart recovery paths.

## Manual Check

1. Start `pnpm backend:dev`, then call `curl http://127.0.0.1:7331/health/diagnostics`. Confirm
   PostgreSQL and the selected Ollama model are `ready`.
2. Temporarily stop PostgreSQL or Ollama, call the diagnostics route again, and confirm the response
   is `degraded` with no connection string or secret in the response. Restore the service afterward.
3. Run `pnpm db:backup`. Confirm a `.dump` file appears outside the workspace in
   `ARC_BACKUP_DIRECTORY`.
4. Restore only a disposable local database with
   `ARC_DATABASE_RESTORE_CONFIRMED=true pnpm db:restore <backup-file>`. Confirm the command refuses
   to run without that environment variable.

## Boundary

The restore command is deliberately destructive and must be used only for the configured local
database. Arc does not create automatic backups or restore a database after a crash.
