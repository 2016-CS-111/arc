# Arc

Arc is a self-hosted AI software engineering platform built as three independent layers:

1. A thin VSCode extension client.
2. A local AI backend server.
3. Local AI infrastructure such as Ollama, PostgreSQL, pgvector, and Redis.

Milestone 1 establishes the TypeScript monorepo foundation and a runnable backend health check.

## Workspace

```txt
apps/vscode-extension  VSCode adapter
apps/ai-server         Local AI backend
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
pnpm --filter @arc/ai-server dev
```

The AI server listens on `http://127.0.0.1:7331` by default.
