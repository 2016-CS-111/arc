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
pnpm db:create
pnpm db:migrate
pnpm db:verify
pnpm project:verify
pnpm source:index:verify
pnpm symbol:index:verify
pnpm dependency:index:verify
pnpm framework-evidence:smoke
pnpm module-resolution:smoke
pnpm tree-sitter:smoke
pnpm ollama:smoke
pnpm chat:socket-smoke
pnpm chat:cancel-smoke
pnpm extension:watch
pnpm extension:run
```

The AI server listens on `http://127.0.0.1:7331` by default.

`pnpm tree-sitter:smoke` verifies the pinned native JavaScript, JSX, TypeScript, and TSX parser
stack. After `pnpm build`, `pnpm tree-sitter:smoke:compiled` verifies the emitted backend path.

`pnpm module-resolution:smoke` verifies the pinned TypeScript resolver, catalog-only virtual
filesystem, NodeNext import/require conditions, extension substitution, classifications, and
project containment. After `pnpm build`, `pnpm module-resolution:smoke:compiled` verifies the
emitted backend path.

`pnpm framework-evidence:smoke` verifies the framework-neutral decorator, call, class-heritage,
JSX, directive, static-value, identity, and range extraction layer across JavaScript, JSX,
TypeScript, and TSX. After `pnpm build`, `pnpm framework-evidence:smoke:compiled` verifies the
emitted backend path.

## PostgreSQL

Milestone 2.5 uses your locally running PostgreSQL server with Sequelize-backed durable sessions.
Create the configured local development database and apply migrations before starting the gateway:

```sh
pnpm db:create
pnpm db:migrate
```

The default connection is `postgresql://postgres:postgres@127.0.0.1:5432/arc`; see `.env.example`
for configuration values. `pnpm db:create` only creates the database named in `ARC_DATABASE_URL`;
it never starts, stops, or manages your local PostgreSQL service. `ARC_DATABASE_SYNC=true` invokes
non-destructive `sequelize.sync()` after a successful connection, but it does not replace
`pnpm db:migrate`.

`pnpm db:verify` applies any pending migrations, then verifies durable session creation, idempotent
turns, streaming/completion persistence, reopen-and-continue behavior, scoped restart recovery,
rename, and deletion against the configured PostgreSQL database. It creates one temporary session
and removes it before exiting.

For the final local acceptance pass, run `pnpm db:verify`, start `pnpm backend:dev`, then open Arc
in the Extension Development Host. Create a conversation, send a prompt, restart the backend or
extension host, reopen the same conversation, and send a follow-up prompt. The prior messages must
remain visible and only the current prompt is sent to the backend.

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
model, or use Stop to cancel the active generation. See
[the Milestone 2.6 acceptance guide](docs/milestone-2.6-acceptance.md) for the final security,
resilience, privacy, and local Ollama verification matrix.

## Project Registration

Milestone 3.1 adds durable project identities. Apply the latest database migration, start the
backend and Extension Development Host, then run `Arc: Register Workspace` from the Command Palette.
The backend validates and canonicalizes the selected local directory and returns the same project
UUID when that directory is registered again.

Registration stores only the workspace name, canonical root path, identity, and timestamps. It
offers an explicit `Scan now` action but never starts filesystem work silently.

The ignore policy combines built-in safety and generated-file rules, root and nested `.gitignore`
files, and an optional root `.arcignore`. Arc-specific rules are additional exclusions and cannot
reinclude a path already excluded by built-in or Git rules. The diagnostic endpoint returns the
matched source and pattern:

```txt
POST /projects/:projectId/ignore/check
Content-Type: application/json

{"path":"packages/api/dist","kind":"directory"}
```

## Repository Inventory

Milestone 3.3 adds explicit metadata-only repository scans. Apply migrations after pulling the
milestone, then start a scan for a registered project:

```txt
POST /projects/:projectId/inventory/scan
GET  /projects/:projectId/inventory/scan
```

The first endpoint performs a bounded rescan and atomically replaces the current inventory. The
second returns the latest durable scan status. Scans never follow symlinks or read file contents.
Configure their limits with `ARC_PROJECT_SCAN_MAX_FILES`, `ARC_PROJECT_SCAN_MAX_TOTAL_BYTES`,
`ARC_PROJECT_SCAN_MAX_DEPTH`, and `ARC_PROJECT_SCAN_BATCH_SIZE`.

In the Extension Development Host, use `Arc: Scan Workspace` for an initial scan or rescan. The
notification and Arc status-bar item show progress and terminal state, and the status is restored
after an extension reload. `pnpm project:verify` runs the repeatable filesystem, PostgreSQL, atomic
replacement, and restart-recovery acceptance gate. See
[the Milestone 3 acceptance guide](docs/milestone-3-acceptance.md) for the complete matrix.

## Source Fingerprints

Milestone 4.1 adds explicit source indexing for the latest usable repository inventory:

```txt
POST /projects/:projectId/sources/index
GET  /projects/:projectId/sources/index
```

The backend rechecks ignore rules, safely inspects bounded regular files, rejects symlinks, binary
data, invalid UTF-8, stale metadata, and concurrent mutations, then stores SHA-256 fingerprints and
language IDs. Source text is held only transiently while hashing; it is never stored in PostgreSQL,
returned by these endpoints, sent to VSCode, or sent to Ollama.

Configure source limits with `ARC_PROJECT_SOURCE_MAX_FILE_BYTES`,
`ARC_PROJECT_SOURCE_MAX_TOTAL_BYTES`, and `ARC_PROJECT_SOURCE_BATCH_SIZE`. Run
`pnpm source:index:verify` to apply pending migrations and verify source safety, stable identities,
catalog freshness, atomic rollback, and restart recovery against local PostgreSQL. Milestone 4.1
does not add a VSCode source-index command; client integration remains Milestone 4.5.

## Symbol Catalog

Milestone 4.2.3 adds explicit durable symbol indexing for a fresh source catalog:

```txt
POST /projects/:projectId/symbols/index
GET  /projects/:projectId/symbols/index
```

The backend re-reads only changed supported files, verifies their SHA-256 fingerprints, and parses
JavaScript, JSX, TypeScript, and TSX through the pinned native Tree-sitter adapter. Unchanged files
with the same parser and extraction identity reuse their durable symbols without another read.
Publication is atomic, and a failed or interrupted run preserves the previous catalog.

PostgreSQL stores declaration names, language-neutral kinds, hierarchy keys, export flags, and
source ranges. It never stores syntax trees, source bodies, signatures, comments, literals, or
arbitrary snippets. Configure extraction with `ARC_PROJECT_SYMBOL_MAX_SYMBOLS_PER_FILE`,
`ARC_PROJECT_SYMBOL_MAX_TOTAL_SYMBOLS`, `ARC_PROJECT_SYMBOL_MAX_NAME_BYTES`,
`ARC_PROJECT_SYMBOL_MAX_QUALIFIED_NAME_BYTES`, `ARC_PROJECT_SYMBOL_YIELD_EVERY_FILES`, and
`ARC_PROJECT_SYMBOL_BATCH_SIZE`. Apply migration `0005_project_symbols.sql` with
`pnpm db:migrate` before using the endpoints.

`pnpm symbol:index:verify` creates a temporary local project and verifies initial extraction,
unchanged reuse without source reads, changed-file replacement, stable symbol UUIDs, parser-version
invalidation, syntax-error and unsupported-file outcomes, source-drift rejection, total limits,
atomic rollback, restart recovery, privacy, and cleanup against local PostgreSQL. VSCode controls
remain Milestone 4.5.

## Dependency Graph

Milestone 4.3 adds explicit durable dependency indexing and bounded traversal for a fresh source
catalog:

```txt
POST /projects/:projectId/dependencies/index
GET  /projects/:projectId/dependencies/index
GET  /projects/:projectId/dependencies/graph?path=src/main.ts
```

The backend reuses unchanged JavaScript, JSX, TypeScript, and TSX dependency declarations without
reading or parsing those code files, while re-resolving every current edge through the
catalog-bounded TypeScript adapter. PostgreSQL stores stable edge and binding keys, module
specifiers, classifications, normalized ranges, and relative local targets. It never stores source
bodies, syntax trees, absolute target paths, TypeScript diagnostics, or failed lookup locations.

Configure indexing with `ARC_PROJECT_DEPENDENCY_MAX_EDGES_PER_FILE`,
`ARC_PROJECT_DEPENDENCY_MAX_TOTAL_EDGES`, `ARC_PROJECT_DEPENDENCY_MAX_BINDINGS_PER_EDGE`,
`ARC_PROJECT_DEPENDENCY_MAX_TOTAL_BINDINGS`, `ARC_PROJECT_DEPENDENCY_MAX_SPECIFIER_BYTES`,
`ARC_PROJECT_DEPENDENCY_MAX_BINDING_NAME_BYTES`, `ARC_PROJECT_DEPENDENCY_MAX_CONFIG_BYTES`,
`ARC_PROJECT_DEPENDENCY_YIELD_EVERY_FILES`, and `ARC_PROJECT_DEPENDENCY_BATCH_SIZE`. Apply migration
`0006_project_dependency_graph.sql` with `pnpm db:migrate` before using the endpoints.

Graph traversal accepts `direction=outgoing|incoming|both`, `depth=1..5`, repeated or comma-separated
dependency and resolution filters, `maxNodes`, `maxEdges`, and `includeBindings`. Server ceilings
are configured with `ARC_PROJECT_DEPENDENCY_GRAPH_MAX_DEPTH`,
`ARC_PROJECT_DEPENDENCY_GRAPH_MAX_NODES`, and `ARC_PROJECT_DEPENDENCY_GRAPH_MAX_EDGES`.

`pnpm dependency:index:verify` creates a temporary project and verifies all supported dialects,
incremental re-resolution, stable edge and binding UUIDs, deterministic cycle-safe traversal,
limits, stale rejection, atomic rollback, restart recovery, privacy, and cleanup against local
PostgreSQL. VSCode dependency controls remain Milestone 4.5.

## Framework Understanding

Milestone 4.4 is split into seven small implementation gates covering a shared evidence foundation,
NestJS, Express, Next.js and React, Sequelize, durable framework publication, and bounded catalog
queries with local PostgreSQL acceptance. Milestone 4.4.1 now provides hash-verified nearest-package
scope detection, exact framework import alias resolution, bounded Tree-sitter evidence extraction
for all four supported dialects, stable evidence identities, and immutable run-scoped symbol and
dependency readers.

No framework-specific entity inference, persistence, endpoint, or VSCode control exists yet.
NestJS analysis is the next gate. The complete design and sub-milestone boundaries are in
`docs/milestone-4.4-architecture.md`.
