# Milestone 15.2 Acceptance

## Automated Evidence

- `AgentRunService` tests cover ordered one-step execution, checkpointing, pause, cancel, and tool-budget failure.
- Controller, shared contract, and VS Code REST-client tests cover typed boundaries and state errors.

## Manual Check

1. Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`.
2. Use `Arc: Plan Task`, review or save the generated JSON, then run `Arc: Start Task Run`.
3. Open `Arc Agent Tasks` to observe the first checkpoint. Use `Arc: Resume Task Run` for the next step, or Pause or Cancel while a step is running.

## Boundary

15.2 can inspect the project and stage existing reviewable proposals. It cannot apply edits, execute commands, or mutate Git state. Task-run state is in memory and is not recovered after a backend restart.
