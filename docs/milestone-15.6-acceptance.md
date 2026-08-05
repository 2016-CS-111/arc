# Milestone 15.6 Acceptance

## Automated Evidence

- The agent treats task-plan values and tool results as untrusted data while retaining its read-only, proposal-only tool policy.
- Three identical tool results stop a step before its visible run-level tool budget is exhausted.
- A model-stream error records the partial tool usage, failed checkpoint, terminal status, and durable final report.
- Existing agent-run coverage verifies staged edits, explicit review, failed test repair, two-repair ceiling, pause, cancel, and restart recovery.

## Manual Check

1. Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`.
2. Start a small task plan and confirm `Arc Agent Tasks` shows each checkpoint and stops for every staged edit or test approval.
3. Reject an edit or fail a test twice. Confirm Arc requests review again for the repair and then stops after the repair budget is exhausted.
4. Stop Ollama during an active step. Confirm the task ends in a visible failed state and its terminal report includes the partial outcome.

## Boundary

Arc does not obey instructions embedded in task plans, project content, or tool output. It never auto-applies a diff, runs a command, or changes Git state during task execution.
