# Milestone 16.5 Acceptance

## Automated Evidence

Run:

```sh
pnpm extension:package
```

Confirm `apps/vscode-extension/arc-<version>.vsix` is created. The package output must contain the
bundled `dist/extension.js`, the built webview assets, extension manifest, icon, and README without
source TypeScript or a `node_modules` tree.

## Local Setup

1. Configure `.env`, then run `pnpm db:migrate`.
2. Run `pnpm setup:doctor`. Resolve any reported database, migration, chat-model, completion-model,
   or configured embedding-model problem before continuing.
3. Build the VSIX and install it with
   `code --install-extension apps/vscode-extension/arc-<version>.vsix`.
4. Start `pnpm backend:dev`, open VS Code, and confirm `Arc: Open Chat` works with the configured
   backend URL.

## Upgrade And Uninstall

For an upgrade, install dependencies, run migrations, rerun the doctor, build the new VSIX, and
install it with the same VS Code command. To remove only the extension, run
`code --uninstall-extension local.arc-vscode-extension`; database records and backups remain until
they are explicitly removed.

## Boundary

The local VSIX is unsigned and does not auto-update. Marketplace publication, artifact signing, and
destructive data removal are outside this gate.
