# Milestone 15.3 Acceptance

## Automated Evidence

- `AgentRunService` covers staged edit/test artifacts, applied edit reconciliation, failed-test repair cycles, and the two-repair ceiling.
- Shared contracts, agent-run controller, and extension REST-client tests cover the typed task-run boundary.

## Manual Check

1. Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`.
2. Start a plan containing an edit step and a test step. Review the diff when Arc pauses, then explicitly Apply or Reject it.
3. Resume the task run. Explicitly Run or Reject the staged non-mutating test. Resume once it finishes.
4. When a test fails, review the next repair diff. Arc stops after two repair attempts if tests keep failing.

## Boundary

15.3 never auto-applies a diff or starts a command. Git, Docker, destructive tasks, and workspace-mutating commands remain outside this gate.
