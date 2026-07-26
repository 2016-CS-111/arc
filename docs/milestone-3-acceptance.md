# Milestone 3 Acceptance Guide

Milestone 3 provides durable project registration, explainable ignore rules, bounded metadata-only
repository inventory, VSCode scan controls, and restart recovery.

## Automated Gate

Run from the workspace root:

```sh
pnpm db:migrate
pnpm project:verify
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm --filter arc-vscode-extension check:webview
pnpm --filter arc-vscode-extension build:webview
```

`pnpm project:verify` creates a temporary repository and PostgreSQL project. It verifies:

- Built-in and `.gitignore` exclusions.
- Symbolic-link skipping.
- Metadata-only initial scan and atomic rescan replacement.
- One current scan ID across every persisted file row.
- Backend-restart recovery from `running` to `failed/scan_interrupted`.
- Preservation of the last usable inventory after recovery.
- Filesystem and database cleanup in `finally`.

## Manual Setup

Apply migrations and run the three development processes in separate terminals:

```sh
pnpm db:migrate
pnpm backend:dev
```

```sh
pnpm extension:watch
```

```sh
pnpm extension:run
```

Continue in the window titled `Extension Development Host`.

## Registration And Initial Scan

1. Open the Arc repository folder.
2. Run `Arc: Register Workspace` from the Command Palette.
3. Choose `Scan now` in the registration notification.
4. Confirm an `Arc: Scanning` progress notification and spinning status-bar item appear.
5. Confirm the terminal notification and status bar report the inventoried file count.

Registration remains explicit. Declining `Scan now` stores the project identity without starting a
scan.

## Rescan And Restore

1. Run `Arc: Scan Workspace` from the Command Palette.
2. Confirm the scan completes without duplicating the stored file count.
3. Reload the Extension Development Host.
4. Confirm the Arc status-bar item restores the latest durable file count.
5. In a multi-root window, focus a file in another folder and confirm the status follows the active
   folder's registered project.

## Failure Checks

1. Stop `pnpm backend:dev` and run `Arc: Scan Workspace`.
2. Confirm the command terminates with an error notification and does not remain busy.
3. Restart the backend and click the Arc status-bar item to rescan.
4. Confirm a successful rescan replaces the failure presentation.
5. Add a temporary path to `.arcignore`, rescan, and confirm the reported file count does not
   increase.

Automated acceptance covers backend termination during a running scan because normal local scans
may complete too quickly for a reliable manual restart.

## Acceptance Matrix

| Area           | Expected result                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| Identity       | Re-registering a canonical workspace reuses its project UUID                    |
| Initial scan   | Registration offers an explicit `Scan now` action                               |
| Rescan         | `Arc: Scan Workspace` runs against the selected registered folder               |
| Progress       | Notification and status bar show an active scan                                 |
| Terminal state | Completed, limited, failed, and interrupted states remain distinguishable       |
| Restart        | Extension reload restores status; backend restart fails abandoned scans durably |
| Ignore policy  | Safety, generated, Git, nested Git, and Arc rules remain enforced               |
| Symlinks       | Symlinks are counted and never traversed                                        |
| Durability     | Atomic rescan replacement and previous-inventory preservation pass              |
| Privacy        | Project file contents are never read or stored                                  |

Milestone 3 is accepted when the automated gate passes and the applicable manual rows are observed
in the Extension Development Host.
