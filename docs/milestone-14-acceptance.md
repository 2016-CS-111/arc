# Milestone 14 Acceptance

Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`. In the Extension Development Host, register the opened local workspace with Arc.

- Open a saved source file, select code, then use the editor lightbulb or `Cmd+.`. Confirm Arc offers Explain, Simplify, Extract Function, Rename Symbol, Add Tests, and Add Documentation; diagnostics also offer Fix Diagnostic.
- Run Explain and confirm the response opens in `Arc Actions` without making a proposal.
- Run an edit action and confirm Arc opens a diff. Choose Reject and confirm the source file is unchanged. Run it again, choose Apply, then choose Undo and confirm the existing edit rollback restores the source.
- After Apply, choose Run tests when Arc offers it. Confirm the command appears in `Arc Tasks`; choosing Skip tests must not run anything.
- Change the document or invoke a second Arc action before the first returns. The older request must be cancelled and must not leave a pending proposal to apply.

All editor source, project reads, model requests, diffs, and validation commands remain on the local Arc backend.
