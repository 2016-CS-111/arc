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
pnpm db:up
pnpm db:migrate
pnpm ollama:smoke
pnpm chat:socket-smoke
pnpm chat:cancel-smoke
pnpm extension:watch
pnpm extension:run
```

The AI server listens on `http://127.0.0.1:7331` by default.

## PostgreSQL

Milestone 2.5 uses Sequelize with PostgreSQL-backed durable sessions. Start the local database and
apply its explicit SQL migrations before starting the durable gateway:

```sh
pnpm db:up
pnpm db:migrate
```

The default connection is `postgresql://arc:arc@127.0.0.1:5433/arc`; see `.env.example` for the
configuration values. `pnpm db:down` stops PostgreSQL without deleting the named data volume.

## Ollama

Milestone 2.1 adds a local Ollama readiness endpoint at:

```txt
GET http://127.0.0.1:7331/providers/ollama/status
```

Use the root `.env.example` as the local configuration reference. `qwen2.5-coder:7b` is the quality default; set
`ARC_OLLAMA_MODEL=qwen2.5-coder:3b` when you prefer faster responses on this MacBook.

Set the selected model before starting the backend, either in your local `.env` file or for one
command:

```sh
ARC_OLLAMA_MODEL=qwen2.5-coder:7b pnpm backend:dev
```

With Ollama running and the selected model installed, verify streaming independently from VSCode:

```sh
pnpm ollama:smoke
pnpm ollama:smoke "Explain a TypeScript discriminated union in two sentences."
```

Milestone 2.2 adds the backend-only Socket.IO chat gateway at the `/chat` namespace. With the
backend already running, verify the complete local streaming protocol:

```sh
pnpm chat:socket-smoke
pnpm chat:socket-smoke "Explain a TypeScript discriminated union in two sentences."
pnpm chat:cancel-smoke
```

`chat:cancel-smoke` cancels as soon as the gateway accepts the request and exits successfully only
when it receives the correlated cancellation event.

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
`Arc: Open Chat` from the Command Palette. The Arc activity-bar view opens and reports the backend
and Ollama readiness through the extension host. Enter a prompt to stream from the configured local
model, or use Stop to cancel the active generation. See [the Milestone 2.4 operating guide](docs/milestone-2.4-test-matrix.md)
for the full manual acceptance sequence and resilience checks.
