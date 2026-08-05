# Milestone 16.2 Architecture

## Diagnostics

`GET /health` remains a fast liveness response for the VS Code extension. `GET /health/diagnostics`
is an explicit local diagnostic request. It checks PostgreSQL connectivity, checks the configured
Ollama chat model, reports bounded process memory and runtime details, and includes the most recent
security-audit retention outcome.

The diagnostic response is typed and reports `ok` only when PostgreSQL and Ollama are ready.
Database failures use a generic message so connection details and credentials do not appear in the
response.

## Recovery And Retention

Arc keeps recovery ownership with the durable workflow that created the state: conversations,
inventory/source/symbol/dependency/framework/embedding indexes, and agent runs each reconcile their
own interrupted work at backend startup. Recovery never replays an applied edit, a command, or a
Git change.

Security audit rows are metadata-only and are pruned at backend startup after
`ARC_SECURITY_AUDIT_RETENTION_DAYS` (90 by default). A retention failure is observable in the
diagnostics response and log, but does not block Arc from starting.

## Backup And Restore

`pnpm db:backup` runs local `pg_dump` in custom format and writes to `ARC_BACKUP_DIRECTORY`, which
defaults outside the workspace at `~/.arc/backups`. PostgreSQL credentials are passed to the child
process through standard libpq environment variables rather than command arguments.

`pnpm db:restore <file>` runs `pg_restore --clean --if-exists --no-owner` only after the user sets
`ARC_DATABASE_RESTORE_CONFIRMED=true`. It always targets `ARC_DATABASE_URL`. Backups and restores
are manual operations; Arc does not auto-restore after a crash.

## Boundary

This gate adds local observability and recovery operations. It does not add remote telemetry,
automatic database snapshots, automatic restore, queues, or multi-user monitoring.
