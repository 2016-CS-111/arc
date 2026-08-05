# Milestone 15.4 Acceptance

## Automated Evidence

- Task contracts require `{ "confirmed": true }` before a staged command starts and expose its approval class.
- The task service classifies workspace writes, Git mutations, and destructive Git operations, and refuses Docker or destructive package scripts before they are proposed.
- Backend controller and VS Code client tests cover the required confirmation payload.

## Manual Check

1. Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`.
2. Start a task that stages a test. Arc displays a normal Run or Reject prompt.
3. Stage `format` or a Git action. Arc displays a warning confirmation naming the elevated action before it sends the task to the backend.
4. Reject the prompt and confirm the command remains pending or becomes rejected; Arc never starts it.
5. Attempt to stage a package script containing `docker compose up` or `rm -rf`. Arc refuses it before presenting any approval UI.

## Boundary

Arc agents can inspect and stage proposed work only. File edits remain behind the diff Apply flow; local commands and Git actions require explicit confirmation; Docker and recognized destructive package scripts are not staged.
