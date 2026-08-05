# Milestone 15.1 Acceptance

Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`. In the Extension Development Host, register the opened workspace with Arc.

- Run `Arc: Plan Task`, describe a small development task, and confirm a JSON draft opens with inspect, edit, and test steps, dependency ids, estimates, and a total estimate.
- Edit the goal, descriptions, estimates, or dependency-safe step ordering. Run `Arc: Save Task Plan` and confirm the normalized JSON replaces the current draft.
- Add an unknown dependency or cycle, then run `Arc: Save Task Plan`. Arc must reject the invalid plan without updating the draft.
- Confirm that planning never changes project files, starts a terminal command, stages an edit proposal, or executes a Git operation.

Task plans are local in-memory drafts in 15.1. Durable journals, execution state, pause/resume, and approval-gated actions begin in later Milestone 15 gates.
