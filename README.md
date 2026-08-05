# Arc

Arc is a self-hosted AI software engineering platform built as three independent layers:

1. A thin VSCode extension client.
2. A local NestJS AI backend server.
3. Local AI infrastructure such as Ollama, PostgreSQL, pgvector, and Redis.

Redis is not required for the current single-user product. PostgreSQL owns durable coordination and
recovery; see [the Milestone 16.4 decision](docs/milestone-16.4-architecture.md) for when a queue
or shared cache becomes justified.

Milestones 1 through 6 complete the Arc MVP: durable local chat, project registration, source
intelligence, semantic retrieval, and grounded project context.

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
pnpm security:dependencies
pnpm evaluation:verify
pnpm setup:doctor
pnpm backend:dev
pnpm db:create
pnpm db:backup
pnpm db:migrate
pnpm db:restore <backup-file>
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
pnpm extension:package
pnpm extension:run
```

The AI server listens on `http://127.0.0.1:7331` by default.

## Install And Upgrade

Run `pnpm setup:doctor` before starting Arc. It checks PostgreSQL connectivity, reports pending
migrations without applying them, checks the configured chat and completion model, and checks the
embedding model when configured. It never changes the database or downloads models.

For a new local install or upgrade, run:

```sh
pnpm install
pnpm db:migrate
pnpm setup:doctor
pnpm extension:package
code --install-extension apps/vscode-extension/arc-0.1.0.vsix
```

The VSIX name follows the extension version in `apps/vscode-extension/package.json`. Installing a
new VSIX through the same VS Code command updates the local extension. Start or restart the backend
with `pnpm backend:dev` afterward.

To remove only the extension, run:

```sh
code --uninstall-extension local.arc-vscode-extension
```

This does not remove local PostgreSQL data or backups. Remove those separately only when you intend
to discard Arc data.

## Security

Milestone 16.1 adds a local permission profile and a durable, metadata-only security audit. The
default `ARC_PERMISSION_PROFILE=review` allows Arc to stage edits, tasks, and memories for the
existing explicit approval flows. Set `ARC_PERMISSION_PROFILE=read_only` before starting the
backend to prevent new proposals from being staged.

With the backend running, inspect the active profile and latest audit events locally:

```sh
curl http://127.0.0.1:7331/security
curl 'http://127.0.0.1:7331/security/audit?limit=50'
```

Audit rows contain only event category, action, status, correlation IDs, and timestamps. They do
not contain prompts, source text, diffs, tool arguments or results, or task output. Console logs
and task output redact common passwords, tokens, authorization headers, and connection-string
passwords. Run `pnpm security:dependencies` to ask the active package manager to report production
dependency vulnerabilities; it reads the lockfile and may contact the configured package registry.
Apply migration `0013_security_audit_events.sql` with `pnpm db:migrate` before reviewing durable
audit history.

`pnpm tree-sitter:smoke` verifies the pinned native JavaScript, JSX, TypeScript, and TSX parser
stack. After `pnpm build`, `pnpm tree-sitter:smoke:compiled` verifies the emitted backend path.

`pnpm module-resolution:smoke` verifies the pinned TypeScript resolver, catalog-only virtual
filesystem, NodeNext import/require conditions, extension substitution, classifications, and
project containment. After `pnpm build`, `pnpm module-resolution:smoke:compiled` verifies the
emitted backend path.

`pnpm framework-evidence:smoke` verifies the framework-neutral decorator, call, class-heritage,
constructor-parameter, JSX, directive, static-value, identity, and range extraction layer across
JavaScript, JSX, TypeScript, and TSX. It also verifies import-bound NestJS route composition and
constructor injection. After `pnpm build`, `pnpm framework-evidence:smoke:compiled` verifies the
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

For an operational check without changing application state, use:

```sh
curl http://127.0.0.1:7331/health
curl http://127.0.0.1:7331/health/diagnostics
```

The diagnostics route actively checks PostgreSQL and Ollama, reports bounded runtime information,
and shows the last audit-retention outcome. The normal `/health` liveness route remains fast for
the extension.

`pnpm db:backup` writes a PostgreSQL custom-format backup through `pg_dump` to
`ARC_BACKUP_DIRECTORY` (default `~/.arc/backups`). Restore is intentionally destructive to the
configured database and requires both a backup path and explicit confirmation:

```sh
ARC_DATABASE_RESTORE_CONFIRMED=true pnpm db:restore ~/.arc/backups/arc-<timestamp>.dump
```

`pg_dump` and `pg_restore` must be on your shell `PATH`. Restore uses `--clean --if-exists` only
against `ARC_DATABASE_URL`; it is never run during Arc startup or automatic recovery.

`pnpm evaluation:verify` runs the deterministic retrieval, completion, edit, tool, and agent
workflow corpus without PostgreSQL or Ollama. It reports each suite's local process duration against
its budget; the model-specific manual timing profile is in
[the Milestone 16.3 acceptance guide](docs/milestone-16.3-acceptance.md).

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

Milestone 5.1 uses `ARC_OLLAMA_EMBEDDING_MODEL=bge-m3` independently from the chat model. Verify the
local embedding and PostgreSQL vector foundations with:

```sh
pnpm embedding:smoke
pnpm pgvector:smoke
pnpm embedding:catalog:verify
pnpm embedding:verify
```

The pgvector smoke applies pending migrations and uses only a temporary 1,024-dimensional table.
The catalog verifier publishes temporary durable vectors and verifies reuse, invalidation,
rollback, hybrid search, recovery, privacy, and cleanup. `embedding:verify` composes it with the
local Ollama relevance check. Project embedding indexes and semantic search are available through:

```txt
POST /projects/:projectId/embeddings/index
GET  /projects/:projectId/embeddings/index
POST /projects/:projectId/embeddings/search
```

The search body accepts `query`, optional `pathPrefix` and `languages`, and a `limit` from 1 to 50.
Results include deterministic `rrf-v1` fused, dense, and metadata lexical ranks and scores.

Milestone 2.2 adds the backend-only Socket.IO chat gateway at the `/chat` namespace. With the
backend already running, verify the complete local streaming protocol:

```sh
pnpm chat:socket-smoke
pnpm chat:socket-smoke "Explain a TypeScript discriminated union in two sentences."
pnpm chat:cancel-smoke
```

`chat:cancel-smoke` cancels as soon as the gateway accepts the request and exits successfully only
when it receives the correlated cancellation event.

Milestone 6 adds grounded project chat. The extension sends the registered project UUID with each
prompt; the backend performs hybrid retrieval, hash-verifies selected source ranges, applies one
model-input budget, and falls back to ordinary chat when context is unavailable. Configure it with:

```txt
ARC_CHAT_CONTEXT_WINDOW_TOKENS=8192
ARC_CHAT_OUTPUT_RESERVE_TOKENS=2048
ARC_CHAT_PROJECT_CONTEXT_TOKENS=3072
ARC_CHAT_HISTORY_TOKENS=2560
ARC_CHAT_CONTEXT_RESULT_LIMIT=12
ARC_CHAT_CONTEXT_MAX_SNIPPET_BYTES=8192
```

To exercise socket chat against an already indexed project:

```sh
ARC_CHAT_SMOKE_PROJECT_ID=<project-uuid> pnpm chat:socket-smoke "Explain this project."
```

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
offers an explicit `Index now` action but never starts filesystem work silently.

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
does not add a standalone VSCode source-index command; the integrated workflow is described below.

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
are provided by the integrated source-intelligence workflow below.

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
PostgreSQL. VSCode dependency controls are provided by the integrated source-intelligence workflow
below.

## Framework Understanding

Milestone 4.4 is split into seven small implementation gates covering a shared evidence foundation,
NestJS, Express, Next.js and React, Sequelize, durable framework publication, and bounded catalog
queries with local PostgreSQL acceptance. Milestone 4.4.1 now provides hash-verified nearest-package
scope detection, exact framework import alias resolution, bounded Tree-sitter evidence extraction
for all four supported dialects, stable evidence identities, and immutable run-scoped symbol and
dependency readers.

Milestones 4.4.2 through 4.4.5 add NestJS, Express, Next.js, React, and Sequelize analyzers. Facts
require exact framework bindings or documented Next.js conventions; static paths, metadata,
components, model attributes, and associations are normalized while dynamic values remain
explicitly unresolved.

Milestone 4.4.6 adds explicit durable framework indexing and status:

```txt
POST /projects/:projectId/frameworks/index
GET  /projects/:projectId/frameworks/index
GET  /projects/:projectId/frameworks/catalog
```

The backend requires one coherent source/symbol/dependency snapshot, caches bounded normalized
evidence, and relinks unchanged files against the current upstream catalogs without reopening or
reparsing source. One Sequelize transaction publishes stable scopes, file outcomes, entities, and
relationships; failed and interrupted runs preserve the prior catalog.

Apply migrations `0007_project_framework_catalog.sql` and
`0008_project_framework_evidence_cache.sql` before using these endpoints. Framework limits use the
`ARC_PROJECT_FRAMEWORK_*` settings in `.env.example`. Catalog reads accept repeated or
comma-separated `framework` and `kind` filters, optional `path` and `scope`, `includeRelations`,
`maxEntities`, and `maxRelationships`. Reads reject missing or stale upstream provenance and expose
independent truncation state.

Run `pnpm framework:index:verify` to exercise all five framework adapters, incremental evidence
reuse and invalidation, bounded deterministic queries, rollback, recovery, privacy, and cleanup
against local PostgreSQL. Milestone 4.4 is complete; automatic indexing and VSCode controls remain
outside its backend scope. The complete design is in `docs/milestone-4.4-architecture.md`.

## Source Intelligence Workflow

Milestone 4.5 introduced the explicit `Arc: Index Workspace Intelligence` command, and Milestone
5.6 adds embeddings as its sixth durable stage. It runs the pipeline in dependency order:

```txt
Repository inventory
Source fingerprints
Symbol catalog
Dependency graph
Framework catalog
Embedding catalog
```

The command is available from the Command Palette, the Arc chat-view title, and the clickable
source-intelligence status item. A notification reports the current stage. The extension never
parses source or infers completion locally; after indexing and after reload, it reads all six
backend status endpoints and requires exact catalog provenance before showing
`Arc: Intelligence ready`.

Limited, stale, running, failed, and backend-unavailable states remain visible. A failed or
interrupted downstream stage preserves the previous complete backend catalogs. Indexing is always
explicit: Arc does not add a watcher, timer, activation-time scan, or background retry.

Run `pnpm source:intelligence:verify` for the complete local PostgreSQL and Ollama acceptance
sequence. The command composes the source, symbol, dependency, framework, and embedding
verification harnesses. See `docs/milestone-5-architecture.md` for the current integration design.
