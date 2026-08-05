# Milestone 15.5 Acceptance

## Automated Evidence

- Sequelize persists validated `AgentRun` snapshots in `agent_run_journals` and reloads them on backend startup.
- Interrupted execution and missing approval waits recover as paused, pending steps; no proposal is replayed.
- Shared report contracts, the REST endpoint, and the VS Code client cover terminal outcome, change/test summaries, and rollback guidance.

## Manual Check

1. Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`.
2. Start a task run, pause it, restart the backend, then Resume it from the open task plan. Confirm it remains paused until you explicitly resume.
3. Stop the backend while Arc is awaiting an edit or task approval. Start it again and confirm Arc asks it to regenerate the step rather than applying or executing the previous proposal.
4. Complete, cancel, or fail a task run. Open `Arc Agent Tasks` and confirm the final outcome, compact edit/test report, and rollback guidance are present.

## Boundary

The journal stores task-run metadata only. It never persists editor buffers, replays a command, auto-applies a diff, or rolls back workspace or Git changes.
