# Milestone 16.5 Architecture

## VSIX

`pnpm extension:package` runs the existing TypeScript checks, bundles the extension host with
esbuild, builds the React webview with Vite, and packages the result through `@vscode/vsce`. The
host bundle keeps `vscode` external because VS Code provides it at runtime; all other host code is
bundled, so VSCE does not need to inspect pnpm workspace dependencies.

The package whitelist contains the bundled host, webview assets, icon, extension manifest, and
extension README. The generated unsigned local VSIX is
`apps/vscode-extension/arc-<version>.vsix` and is ignored by Git.

## Setup Doctor

`pnpm setup:doctor` is read-only. It checks PostgreSQL reachability, reports pending migrations,
checks the configured chat and completion model, and checks the embedding model when configured.
It returns a nonzero status for an incomplete setup but never applies migrations, downloads models,
or changes Arc state.

## Lifecycle

Upgrades run `pnpm db:migrate` explicitly before the backend starts, then package and install the
new VSIX. VS Code installs the newer local VSIX through its usual install command. Uninstalling the
extension does not alter PostgreSQL data or backups.

## Boundary

This gate packages unsigned, local VSIX artifacts only. It does not publish to the VS Code
Marketplace, sign an artifact, run an automatic upgrade, or delete user data on uninstall.
