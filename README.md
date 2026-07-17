# Arc

Arc is a self-hosted AI software engineering platform built as three independent layers:

1. A thin VSCode extension client.
2. A local NestJS AI backend server.
3. Local AI infrastructure such as Ollama, PostgreSQL, pgvector, and Redis.

Milestone 1 establishes the TypeScript monorepo foundation and a runnable backend health check.

## Workspace

```txt
apps/vscode-extension  VSCode adapter
apps/ai-server         Local NestJS AI backend
packages/contracts     Shared API/event contracts
packages/shared        Cross-package utilities
docs                   Architecture and roadmap
infra                  Local infrastructure manifests, added as needed
```

## Commands

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm backend:dev
pnpm extension:watch
pnpm extension:run
```

The AI server listens on `http://127.0.0.1:7331` by default.

For manual development, run these from separate terminals:

```sh
pnpm backend:dev
```

```sh
pnpm extension:watch
```

```sh
pnpm extension:run
```

The extension window title should include `Extension Development Host`. In that window, run
`Arc: Open Chat` from the Command Palette.
