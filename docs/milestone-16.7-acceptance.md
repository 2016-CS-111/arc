# Milestone 16.7: Release Checklist

## Prepare

1. Review the diff and set the same release version in `package.json` and
   `apps/vscode-extension/package.json`.
2. Record the target platform results using [the compatibility matrix](milestone-16.6-acceptance.md).
3. Confirm PostgreSQL with pgvector and the configured Ollama models are running locally.

## Verify

```sh
pnpm install --frozen-lockfile
pnpm clean
pnpm build
pnpm test
pnpm lint
pnpm format:check
pnpm security:dependencies
pnpm evaluation:verify
pnpm db:migrate
pnpm setup:doctor
pnpm db:verify
pnpm source:intelligence:verify
pnpm extension:package
```

Every command must pass. The dependency audit may require package-registry network access. Keep the
generated `apps/vscode-extension/arc-<version>.vsix` outside Git and inspect its file list before
sharing it.

## Local Product Acceptance

1. Install the VSIX with `code --install-extension apps/vscode-extension/arc-<version>.vsix`.
2. Start `pnpm backend:dev`, open Arc, and confirm backend and model status are ready.
3. Register and index a small workspace, send a chat prompt, stop one active response, and confirm a
   task can be proposed, run, and cancelled through the existing approval flow.
4. Restart the backend or Extension Development Host, reopen the conversation, and confirm durable
   history remains available.
5. Run `pnpm db:backup` and retain the reported backup path. Do not test restore against production
   data.

## Distribution

For private local use, share the reviewed unsigned VSIX and install it manually. For signed public
distribution, publish through an approved Visual Studio Marketplace publisher. The Marketplace
signs published extensions; do not weaken VS Code signature verification to install an untrusted
artifact. VS Code documents [packaging and publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and [signature verification](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace).

Record the release version, commit, VSIX filename, target platforms, manual acceptance result,
backup location, publisher outcome, and known limitations with the release notes.
