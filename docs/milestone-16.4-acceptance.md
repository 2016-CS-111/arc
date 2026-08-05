# Milestone 16.4 Acceptance

## Evidence

Run:

```sh
pnpm evaluation:verify
```

The deterministic retrieval, completion, edit, tool, and agent corpus must pass without Redis,
PostgreSQL, Ollama, or a network connection. Existing focused tests cover PostgreSQL-backed turn
deduplication, per-project index conflicts, interrupted-index recovery, and paused agent-run
recovery.

## Manual Check

1. Start only local PostgreSQL, Ollama, and `pnpm backend:dev`; no Redis service is required.
2. Start a chat generation or a project index, stop the backend, and restart it.
3. Confirm chat work is marked interrupted, index work is marked failed, and agent work is paused.
   Confirm that no model request, edit, command, or Git action resumes automatically.

## Boundary

Redis is intentionally absent from the current single-user deployment. Adding a queue or cache
requires the measured need and safety review described in `milestone-16.4-architecture.md`.
