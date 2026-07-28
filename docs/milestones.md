# Milestones

## Milestone 1: Foundation

Goal: create a compiling monorepo with strict TypeScript, a runnable NestJS backend, and a minimal
VSCode extension activation path.

Included:

- Root workspace configuration.
- Shared API contracts package.
- Shared utilities package.
- NestJS AI server with `/health`.
- NestJS Socket.IO gateway registration.
- VSCode extension command and backend URL setting.
- Unit test for the health response contract.

Not included yet:

- Ollama integration.
- Chat webview.
- PostgreSQL, pgvector, or Redis.
- File editing tools.
- Repository indexing.

## Milestone 2: Local Chat MVP

Status: Complete.

Goal: deliver the first complete local chat path from VSCode to Ollama. Milestone 2 is divided into
small, independently testable sub-milestones so each boundary is proven before another layer is
added.

### Milestone 2.1: Ollama Provider Foundation

Status: Complete.

Goal: prove that the NestJS backend can discover and communicate with the configured local Ollama
instance without involving Socket.IO or the VSCode UI.

Included:

- Ollama URL and model configuration.
- Provider-neutral chat model port.
- Ollama adapter with streaming NDJSON parsing and cancellation support.
- Ollama availability and model-readiness endpoint.
- Unit tests for normal streams, fragmented chunks, provider errors, and cancellation.
- Manual backend-to-Ollama smoke command.

Acceptance gate:

- The backend reports whether Ollama is reachable and whether the configured model is installed.
- The smoke command receives streamed text from Ollama.
- Build, test, lint, and format checks pass without the VSCode extension running.

Not included yet:

- Socket.IO chat events.
- Chat UI.
- Conversation persistence.

### Milestone 2.2: Backend Streaming Protocol

Status: Complete.

Goal: expose the Ollama adapter through a stable, validated Socket.IO chat protocol that can be
tested without VSCode.

Included:

- Shared Zod contracts for chat commands, acknowledgements, deltas, completion, cancellation, and
  errors.
- NestJS chat application service and gateway.
- Request, session, and message correlation identifiers.
- One active generation per session.
- Cancellation and disconnect cleanup.
- A terminal-based Socket.IO smoke client.
- Gateway and application-service tests using an in-memory repository test adapter.

Acceptance gate:

- The terminal client can submit a prompt, receive ordered deltas, and cancel generation.
- Missing-model and provider failures produce typed errors rather than disconnecting the client.
- Build, test, lint, and format checks pass.

Not included yet:

- React webview.
- Durable chat history.

### Milestone 2.3: VSCode Webview Foundation

Status: Complete.

Goal: establish a secure React + Vite webview and a typed message bridge to the VSCode extension
host before connecting it to chat streaming.

Included:

- Arc activity-bar chat view.
- Working `Arc: Open Chat` command.
- React + Vite webview build integrated into the extension package.
- Content Security Policy, nonce-based scripts, and restricted local resource roots.
- Validated webview-to-extension messages.
- Backend and Ollama connection status displayed through the extension host.
- Webview reducer and bridge tests.

Acceptance gate:

- The Arc chat view opens reliably in an Extension Development Host.
- The webview reports real backend and Ollama status without making direct network requests.
- Reloading the view does not duplicate listeners or extension registrations.
- Extension build, tests, lint, and format checks pass.

Not included yet:

- Prompt submission from the webview.
- Markdown rendering.
- Chat history.

### Milestone 2.4: End-to-End Streaming Chat

Status: Planned.

Goal: connect the webview, extension host, backend gateway, and Ollama adapter into one working chat
flow. Milestone 2.4 is divided into four independently testable gates so transport, state, UI, and
resilience failures can be isolated.

#### Milestone 2.4.1: Chat State and Bridge Contracts

Status: Complete.

Goal: define the temporary chat state model and the validated message boundary between the webview
and extension host without opening a Socket.IO connection.

Included:

- Webview commands for submitting and cancelling a prompt.
- Extension-host events for hydration, generation start, deltas, completion, cancellation, errors,
  and connection state.
- Host-generated session, request, and message identifiers.
- In-memory conversation and active-generation state owned by the extension host.
- Reducer transitions for idle, submitting, streaming, completed, cancelled, and failed states.
- Contract, state-machine, stale-event, and reducer tests.

Acceptance gate:

- Invalid bridge messages are rejected without changing chat state.
- A deterministic event sequence produces the expected user and assistant messages.
- Stale request identifiers cannot mutate the active generation.
- A reloaded webview can hydrate from the extension host's in-memory snapshot.
- Build, tests, lint, and format checks pass.

Not included yet:

- Socket.IO client.
- Visible composer or conversation UI.
- Ollama requests.

#### Milestone 2.4.2: Extension Chat Transport

Status: Complete.

Goal: connect the extension-host chat controller to the existing NestJS `/chat` namespace through a
provider-neutral transport boundary.

Included:

- Socket.IO client owned by the extension host.
- `ChatTransportPort` and `SocketIoChatTransport` implementations.
- Correlated send, accepted, delta, completed, cancelled, and error events.
- Stop-generation forwarding.
- Lazy connection, bounded reconnection, and disconnect cleanup.
- Fake-transport controller tests and backend protocol integration tests.

Acceptance gate:

- The extension host can stream a deterministic response without the React UI.
- Cancellation reaches the backend and terminates the matching request.
- Malformed, duplicate, and stale backend events do not corrupt session state.
- A disconnect marks an active generation as interrupted and never silently resends it.
- Build, test, lint, and format checks pass.

Not included yet:

- Chat composer and conversation rendering.
- Manual Ollama acceptance test.

#### Milestone 2.4.3: Streaming Chat UI

Status: Complete.

Goal: expose the proven chat controller through a focused plain-text React experience in the Arc
activity-bar view.

Included:

- Plain-text user and assistant message list.
- Multiline composer with Send and Stop actions.
- Streaming assistant message updates.
- Compact connection, generation, empty, cancelled, and error states.
- Auto-scroll behavior that respects manual user scrolling.
- Tailwind components, Lucide controls, accessibility labels, and reducer tests.

Acceptance gate:

- Submitting a prompt renders the user message and a streaming assistant response.
- The composer cannot create a second request while one is active.
- Stop, cancellation, failure, and reconnect states remain usable in a narrow sidebar.
- Webview reload hydrates the current in-memory conversation.
- Build, tests, lint, and format checks pass.

Not included yet:

- Markdown, syntax highlighting, and code-copy actions.
- Durable conversation history.

#### Milestone 2.4.4: Integration and Resilience

Status: Complete.

Goal: prove the complete prompt-to-token path under normal operation, cancellation, and local
infrastructure failures.

Included:

- End-to-end test with a deterministic fake model.
- Backend restart, disconnect, cancellation-race, timeout, and malformed-event coverage.
- Manual streaming and cancellation test with the configured Ollama model.
- Final operating instructions and Milestone 2.4 test matrix.

Acceptance gate:

- A prompt entered in the Arc view streams a response from `qwen2.5-coder:7b`.
- Stop generation cancels the corresponding backend request.
- Backend restarts and connection failures do not freeze the webview or lose control of the
  composer.
- No automatic retry can accidentally produce a duplicate generation.
- Full workspace build, test, lint, and format checks pass.

Not included:

- PostgreSQL-backed sessions.
- Rich Markdown and syntax highlighting.
- Repository context, tools, or file editing.

### Milestone 2.5: Durable Chat Sessions

Goal: make the backend the source of truth for conversations and preserve chat history across
VSCode and backend restarts.

Milestone 2.5 is divided into independently testable persistence, backend, transport, UI, and
acceptance gates.

#### Milestone 2.5.1: PostgreSQL Foundation

Status: Complete.

Included:

- Local PostgreSQL development configuration.
- Typed database environment configuration.
- Explicit, ordered SQL migration runner.
- Initial session and message schema with durable terminal states.
- Shared conversation API contracts.

Not included yet:

- PostgreSQL repository behavior.
- Session REST endpoints or Socket.IO protocol changes.
- Extension synchronization or history UI.

#### Milestone 2.5.2: Conversation Repository and Services

Status: Complete.

Included:

- Conversation repository port and Sequelize adapter.
- Create, list, load, rename, delete, and interrupted-generation recovery services.

Not included yet:

- Session REST endpoints or Socket.IO protocol changes.
- Persisting active gateway streams or loading persisted context for new requests.
- Extension synchronization or history UI.

#### Milestone 2.5.3: Durable Chat Transport

Status: Complete.

Included:

- Session REST API and durable streaming gateway integration.
- Backend-owned context loading, persisted generation state, and recovery after restart.

Details:

- `POST`, `GET`, `PATCH`, and `DELETE` session endpoints at `/conversations`.
- Socket commands carry only the current user prompt; retained context is loaded from PostgreSQL.
- A user message and pending assistant placeholder are persisted before `chat:accepted`.
- Every streamed assistant delta and terminal outcome is persisted before its matching socket event.
- Pending and streaming records are recovered as retryable failures on backend startup.
- Current UUID extension sessions are lazily registered for compatibility until the session-history UI
  owns explicit creation and hydration in Milestone 2.5.4.

Not included yet:

- Extension synchronization with session snapshots.
- Reopen, rename, delete, or history-list controls in the Arc view.

#### Milestone 2.5.4: Session History UI

Status: Complete.

Included:

- Typed extension-host REST client for backend conversation snapshots.
- Session-list hydration when the Arc view opens, with a durable first-session fallback.
- Create, reopen, rename, and delete session workflows.
- Compact session-history UI in the Arc view, disabled while a generation is active.
- Existing streaming state reused for hydrated durable messages and newly created turns.
- Opt-in, non-destructive `sequelize.sync()` after connection through `ARC_DATABASE_SYNC=true`.

Details:

- The webview never calls the REST API directly; its validated bridge sends session commands to the
  extension host.
- A view reload lists persisted sessions, restores the previously selected session when available,
  or opens the newest one. An empty database receives one explicitly created `New chat` session.
- REST operations and hydration are serialized, preventing duplicate session creation from repeated
  webview-ready messages.
- `sequelize.sync()` is deliberately opt-in and has no `alter` or `force` option. Ordered SQL
  migrations remain the versioned schema authority.

Not included yet:

- Live PostgreSQL integration coverage and manual restart acceptance.

#### Milestone 2.5.5: Persistence Acceptance

Status: Complete.

Included:

- `pnpm db:verify` PostgreSQL repository acceptance command.
- Isolated checks for create, idempotency, streaming, completion, reopen-and-continue, list,
  rename, delete, and restart recovery.
- Scoped recovery verification that cannot alter another in-progress session.
- Manual VSCode/backend restart acceptance instructions.

Local acceptance:

1. Start local PostgreSQL, then run `pnpm db:create` and `pnpm db:verify`.
2. Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`.
3. Create a conversation, stream a response, restart the backend or Extension Development Host,
   reopen that conversation, and send a follow-up prompt.

Acceptance evidence:

- `pnpm db:verify` passed against the configured native PostgreSQL database after applying
  `0001_chat_sessions.sql`.

Acceptance gate:

- Conversations survive VSCode and backend restarts.
- A session can be reopened and continued without the client resending its full history.
- Failed and cancelled generations leave the session in a consistent state.
- Database migration, build, test, lint, and format checks pass.

Not included yet:

- pgvector embeddings.
- Redis.
- Long-term project memory.

### Milestone 2.6: Chat Presentation and Resilience

Status: Complete.

Goal: complete the Local Chat MVP with safe rich rendering and production-quality failure handling.

Included:

- Sanitized Markdown and GitHub-flavored Markdown rendering.
- Fenced code blocks, syntax highlighting, and code-copy actions.
- Streaming-aware auto-scroll and responsive chat layout.
- Input and history limits.
- Reconnect behavior, timeout handling, and normalized user-facing errors.
- Logging that excludes prompt and response contents by default.
- Updated architecture, operating instructions, and manual test matrix.

#### Milestone 2.6.1: Safe Markdown Foundation

Status: Complete.

- Render assistant output as Markdown with GitHub-flavored Markdown support.
- Treat model output as untrusted: ignore raw HTML, block images, and allow only `http` and `https` links.
- Apply an explicit sanitization schema after Markdown processing.
- Add focused tests for GFM output, malicious HTML, unsafe URI schemes, and malformed Markdown.

Acceptance gate:

- Model-provided scripts, event attributes, Markdown images, and unsafe URI schemes cannot become active webview content.
- Supported GFM tables, task lists, and strikethrough render correctly.

#### Milestone 2.6.2: Code Blocks and Trusted Actions

Status: Complete.

- Add fenced-code language labels and syntax highlighting.
- Add a code-copy action through the validated extension-host bridge.
- Open external links only after extension-host URL validation.

#### Milestone 2.6.3: Streaming Performance and Scroll

Status: Complete.

- Batch streamed UI updates and memoize completed messages.
- Reduce or lazy-load the syntax grammar footprint to keep the webview bundle below its warning threshold.
- Preserve follow mode while the user is near the latest message.
- Pause automatic scrolling during manual review and provide a jump-to-latest action.
- Keep long responses, tables, and code blocks usable in narrow layouts.
- Constrain the webview root to the available viewport so long transcripts cannot push the composer
  or jump-to-latest action outside the VSCode panel.

#### Milestone 2.6.4: Transport Resilience and Error UX

Status: Complete.

- Added bounded Socket.IO reconnect attempts with `connecting`, `connected`, `reconnecting`, and
  `offline` states plus an explicit reconnect action.
- Kept the backend's 300-second model timeout ownership and added a 330-second activity watchdog in
  the extension host.
- Normalized backend, provider, model, timeout, cancellation, and connection errors for the chat UI.
- Verified that disconnect and watchdog paths terminate the active request without automatically
  resending a user prompt.

#### Milestone 2.6.5: Privacy Logging and Acceptance

Status: Complete.

- Added content-free generation lifecycle logging with request and session identifiers, duration,
  mode, status, and typed error codes.
- Removed raw persistence error messages from chat logs and added privacy regression coverage.
- Documented the automated gate and security, resilience, presentation, durability, privacy, and
  manual Ollama test matrix in `docs/milestone-2.6-acceptance.md`.
- Workspace tests, lint, format, type-check, production builds, PostgreSQL verification, direct
  Ollama streaming, Socket.IO streaming/cancellation, unavailable-provider, missing-model, timeout,
  and privacy-log checks pass.
- VSCode presentation, security, narrow/wide layout, scroll-follow, cancellation, reconnect, and
  backend/Extension Development Host restart observations pass on the target local machine.

Acceptance gate:

- Untrusted model output cannot inject scripts into the webview.
- Long responses and code blocks remain usable in narrow and wide VSCode layouts.
- Backend unavailable, Ollama unavailable, missing model, timeout, cancellation, and reconnect paths
  are manually verified.
- Full workspace build, test, lint, and format checks pass.

Milestone 2 is complete with all six acceptance gates passing. Repository context, embeddings, tool
calling, file editing, memory, and autonomous execution remain outside this milestone.

## Milestone 3: Project Registration

Status: Complete.

Goal: allow the extension to register the active workspace with the backend.

Milestone 3 is divided into identity, ignore-policy, repository-inventory, and integration gates.
Registration establishes a stable project identity first; it does not implicitly read or index
workspace files.

### Milestone 3.1: Project Identity and Registration

Status: Complete.

Goal: establish one durable backend-owned project identity for each canonical local workspace root.

Included:

- Shared request, response, and project identity contracts.
- A `projects` PostgreSQL table and class-based Sequelize model.
- A project repository port with an idempotent Sequelize adapter.
- Canonical workspace-directory validation owned by the backend.
- `POST /projects/register` for backend clients.
- `Arc: Register Workspace` for the active VSCode workspace folder.
- Workspace-state storage of the returned project identity.
- Contract, resolver, repository, controller, and extension REST-client tests.

Acceptance gate:

- Registering a real local directory returns a server-generated project UUID.
- Registering the same directory through an equivalent path returns the same UUID.
- Missing, relative, and non-directory roots are rejected.
- A multi-root VSCode window registers the active editor's folder or asks the user to select one.
- No workspace file contents are read or stored.
- Build, test, lint, and format checks pass.

Not included yet:

- Ignore rules.
- Repository traversal or file metadata.
- File contents, embeddings, or semantic indexing.
- Automatic registration when a workspace opens.

### Milestone 3.2: Workspace Ignore Policy

Status: Complete.

Goal: produce one testable ignore decision for a project-relative path before any repository
traversal is introduced.

Included:

- Hard built-in exclusions for Git internals, Arc internals, environment files, and common private
  key formats.
- Built-in exclusions for dependency, generated-output, cache, coverage, and temporary directories.
- Git-compatible root and nested `.gitignore` parsing through the `ignore` library.
- Root `.arcignore` rules for Arc-only additional exclusions and local negation within that file.
- Portable project-relative path normalization with absolute and parent traversal rejection.
- Bounded regular-file reads for ignore files; symlinks are not followed and each file is limited to
  1 MiB.
- `POST /projects/:projectId/ignore/check` with the normalized path, decision, source file, and
  matching pattern.
- Contract, normalization, nested-rule, precedence, filesystem, repository, and controller tests.

Precedence:

1. Built-in safety exclusions.
2. Built-in generated-file exclusions.
3. Root and nested `.gitignore` rules, with normal Git parent-directory behavior.
4. Root `.arcignore` as an additional exclusion layer.

An `.arcignore` negation can refine another rule in the same `.arcignore` file. It cannot reinclude
a path excluded by a safety, generated, or Git rule.

Acceptance gate:

- Secret and generated paths are excluded without project configuration.
- A nested `.gitignore` is relative to its own directory and can negate a parent file pattern only
  when its parent directory remains traversable.
- `.arcignore` can add Arc-only exclusions without changing Git state.
- Invalid, absolute, escaping, oversized, and unknown-project requests fail with stable API errors.
- Included and excluded decisions identify their normalized path and exclusion source.
- Build, test, lint, and format checks pass.

Not included yet:

- Directory traversal.
- Persisted file metadata or scan status.
- Ignore decision caching or file watching.
- VSCode scan controls.

### Milestone 3.3: Bounded Repository Inventory

Status: Complete.

Goal: scan non-ignored paths into a bounded metadata inventory without reading file contents.

Included:

- Durable `project_scans` and current `project_files` tables with class-based Sequelize models.
- Explicit `POST /projects/:projectId/inventory/scan` rescan endpoint.
- Latest durable status at `GET /projects/:projectId/inventory/scan`.
- Deterministic directory traversal that never follows symlinks.
- Reuse of one prepared Milestone 3.2 ignore evaluator for every candidate path.
- Metadata-only entries containing relative path, byte size, and modification time.
- Configurable file-count, total-byte, and depth limits.
- `running`, `completed`, `limited`, and `failed` scan states with stable limit reasons and error
  codes.
- One running scan per project, enforced by a partial unique PostgreSQL index.
- Atomic replacement of the current inventory in configurable Sequelize bulk-create batches.
- Failed-scan recording that preserves the last completed or limited inventory.
- Contract, configuration, walker, service, repository, controller, limit, symlink, concurrency, and
  failure-path tests.

Default limits:

- 20,000 files.
- 2 GiB aggregate file size.
- 32 path segments.
- 500 metadata rows per persistence batch.

Acceptance gate:

- Ignored files and directories never enter the inventory.
- Symbolic links are counted and skipped without being followed.
- Traversal stops before exceeding file-count or total-byte limits and does not descend beyond the
  depth limit.
- A completed or limited scan atomically replaces the previous inventory.
- A failed scan stores a stable error code without deleting the previous inventory.
- Concurrent scan requests for one project return a conflict.
- No file contents are read or stored.
- Full workspace build, test, lint, format, migration, and local scan checks pass.

Not included yet:

- Automatic scanning during registration.
- Filesystem watching or incremental inventory updates.
- Scan progress events or cancellation.
- VSCode scan controls and inventory presentation.
- File content parsing, hashing, embeddings, or semantic search.

### Milestone 3.4: Registration Integration and Acceptance

Status: Complete.

Goal: connect registration, ignore evaluation, and inventory scanning into an observable,
recoverable workspace workflow.

Included:

- Registration notification with an explicit `Scan now` action.
- `Arc: Scan Workspace` for initial scans and rescans of the selected registered folder.
- Shared active-folder selection for single-root and multi-root workspaces.
- Validated backend project identities stored per VSCode workspace folder.
- Indeterminate notification progress during the synchronous metadata scan.
- Clickable status-bar presentation for not-scanned, running, completed, limited, failed, backend
  unavailable, and restart-interrupted states.
- Latest durable status restoration on extension activation and active-folder changes.
- Backend bootstrap recovery of abandoned `running` scans to `failed/scan_interrupted`.
- Preservation of the last usable inventory during scan failure and restart recovery.
- `pnpm project:verify` acceptance command with temporary filesystem and PostgreSQL cleanup.
- Final workflow and test matrix in `docs/milestone-3-acceptance.md`.

Acceptance gate:

- Registering a workspace offers, but never silently starts, the initial scan.
- Scan progress and terminal state remain visible in VSCode.
- The status bar restores durable state after an Extension Host restart.
- Backend-unavailable and failed scans terminate cleanly and remain retryable by explicit command.
- Abandoned backend scans recover to a stable interrupted state without deleting current files.
- The automated project verifier, full workspace gate, and applicable Extension Development Host
  checks pass.

Milestone 3 is complete. File contents, language parsing, hashing, embeddings, semantic retrieval,
filesystem watching, and automatic background indexing remain outside this milestone.

## Milestone 4: Source Intelligence

Status: In progress.

Goal: transform the safe repository inventory into structured, freshness-aware source intelligence
without sending the repository to the model.

Milestone 4 is divided into content safety, symbols, dependency graphs, framework understanding,
and client-integration gates. Detailed designs are in `docs/milestone-4.1-architecture.md`,
`docs/milestone-4.2-architecture.md`, and `docs/milestone-4.3-architecture.md`.

### Milestone 4.1: Content Safety and Fingerprints

Status: Complete.

Goal: safely fingerprint eligible UTF-8 source files and publish an atomic source catalog without
persisting source text.

Included:

- Explicit backend source-index request based on the latest usable metadata inventory.
- Re-evaluation of current ignore rules immediately before every content read.
- Bounded regular-file reads with containment, symlink, mutation, binary, and UTF-8 checks.
- Exact-byte SHA-256 fingerprints and deterministic path-based language classification.
- Durable source-index runs and per-path ready or skipped outcomes in PostgreSQL.
- Separate source catalog with inventory-scan freshness reporting.
- Atomic publication and preservation of the previous catalog after failure or restart interruption.
- Local PostgreSQL acceptance command.
- Shared contract, source reader, classifier, service, repository, controller, and recovery tests.
- `pnpm source:index:verify` coverage for stable IDs, changed hashes, freshness, atomic rollback,
  restart recovery, and cleanup.

Not included:

- Persisted source text.
- Tree-sitter, syntax trees, symbols, or dependency edges.
- Embeddings, chunks, semantic search, or chat context.
- VSCode controls, automatic indexing, filesystem watching, or background workers.

Acceptance gate:

- Only explicitly requested, currently eligible, bounded UTF-8 regular files are fingerprinted.
- Source text is absent from PostgreSQL, logs, API responses, VSCode, and Ollama.
- Repeated unchanged indexing preserves source-file identity and hashes.
- Metadata rescans make the current source catalog observably stale.
- Successful publication is atomic; failed and interrupted runs preserve the previous catalog.
- Full workspace and local PostgreSQL verification pass.

Milestone 4.1 is complete. It establishes fingerprints and freshness only; source text parsing and
symbol persistence begin in Milestone 4.2.

### Milestone 4.2: Symbol Extraction

Status: Complete.

Goal: parse ready source files with Tree-sitter and persist language-neutral symbols.

Delivered:

- Backend-only native Tree-sitter adapter with JavaScript, JSX, TypeScript, and TSX grammars.
- Mandatory Intel macOS compatibility gate before persistence work.
- Declarative query packs behind a parser-neutral application port.
- Durable symbol-index runs, per-file parse states, and language-neutral symbols.
- Source-hash and parser-version invalidation with unchanged-file reuse.
- Stable symbol identities, lexical hierarchy, export state, and source ranges.
- Atomic publication, failure preservation, and backend-restart recovery.
- No persisted syntax trees, source bodies, signatures, comments, literals, or arbitrary snippets.

#### Milestone 4.2.1: Native Parser Compatibility

Status: Complete.

Goal: prove the pinned native runtime and JS/TS grammar set in development, tests, and compiled
backend execution before adding schema.

Delivered:

- Pinned `tree-sitter@0.21.1`, `tree-sitter-javascript@0.23.1`, and
  `tree-sitter-typescript@0.23.2`.
- Explicit pnpm native-build approval limited to the parser runtime and grammars.
- Backend-only class-based grammar registry and compatibility probe.
- JavaScript, JSX, TypeScript, and distinct TSX parsing with query execution.
- Native UTF-16 range verification and exclusive UTF-8 byte-range normalization.
- Malformed-input tolerance and repeated parser lifecycle coverage.
- `pnpm tree-sitter:smoke` development command and compiled backend smoke command.
- Verified on Node `v24.18.0`, Darwin x64 with the complete test, lint, format, and build gate.

No database migration, Sequelize model, symbol contract, query pack, persistence, API, or VSCode
change was introduced.

#### Milestone 4.2.2: Extraction Contracts and Query Packs

Status: Complete.

Goal: extract deterministic language-neutral symbols from JavaScript, JSX, TypeScript, and TSX
fixtures without PostgreSQL.

Delivered:

- Parser-neutral language, kind, range, limit, extracted-symbol, and extraction-result types.
- `SourceSymbolExtractor` application port with Tree-sitter isolated in infrastructure.
- JavaScript/JSX and TypeScript/TSX declaration query packs.
- Class, interface, type alias, enum, module, namespace, function, constructor, method, property,
  module-level variable, and constant extraction.
- Nested named functions, lexical parent keys, qualified names, direct export flags, and
  deterministic source ordering.
- SHA-256 identities based on language, parent identity, kind, name, and sibling occurrence rather
  than source offsets.
- Query-schema-versioned parser identities for future incremental invalidation.
- Name, qualified-name, and per-file symbol limits with stable omission reasons and no truncation.
- Golden tests for JavaScript, JSX, TypeScript, TSX, malformed source, Unicode, duplicates,
  exclusions, zero-symbol files, and limits.

No migration, Sequelize model, PostgreSQL write, API endpoint, or VSCode change was introduced.

#### Milestone 4.2.3: Durable Incremental Symbol Catalog

Status: Complete.

Goal: persist and atomically publish reusable per-file symbol results with status and recovery APIs.

Delivered:

- Shared symbol-index run and freshness contracts with bounded typed statuses and errors.
- Migration and class-based Sequelize models for runs, file outcomes, and language-neutral symbols.
- Current ready source-catalog reads without source content.
- Hash and parser-identity reuse, including extraction-limit invalidation.
- Safe re-read and SHA-256 verification for every changed supported source file.
- Durable unsupported, source-changed, read-failed, parse-failed, syntax-error, and limited outcomes.
- Configurable per-file and total symbol limits with periodic event-loop yields.
- One-transaction publication preserving stable file and symbol UUIDs and removing stale results.
- Failure preservation and backend-start recovery for abandoned running indexes.
- Explicit symbol-index and status REST endpoints with stable `400`, `404`, `409`, and `503`
  behavior.
- Focused contract, orchestration, Sequelize repository, source-catalog, controller, and recovery
  tests.

No local PostgreSQL acceptance command or VSCode symbol-index controls were introduced; those
remain Milestones 4.2.4 and 4.5 respectively.

#### Milestone 4.2.4: Symbol Acceptance

Status: Complete.

Goal: prove symbol identity, invalidation, syntax-error tolerance, atomicity, recovery, privacy, and
cleanup against local PostgreSQL.

Delivered:

- `pnpm symbol:index:verify` using a temporary project and the configured local PostgreSQL database.
- Initial JavaScript and TypeScript extraction with malformed-source tolerance and unsupported
  language state.
- Zero-read, zero-parse unchanged reuse.
- Changed-file-only parsing, deleted-symbol cleanup, and stable symbol UUID verification.
- Parser-revision invalidation and post-fingerprint source-change rejection before Tree-sitter.
- Failed-file recovery after a fresh source fingerprint.
- Total-symbol limit enforcement and restoration under normal limits.
- Transaction rollback and restart recovery preserving the previous complete catalog.
- Source-body and syntax-tree privacy checks across schema and persisted rows.
- Automatic cleanup of the temporary project and filesystem fixture.
- Complete tests, lint, format, TypeScript build, webview type-check, and webview production build.

Milestone 4.2 is complete. Symbol names, kinds, hierarchy, ranges, freshness, and incremental
publication are now durable backend capabilities. Import resolution begins in Milestone 4.3;
VSCode source-intelligence controls remain Milestone 4.5.

### Milestone 4.3: Import and Dependency Graph

Status: Complete.

Goal: resolve file and module relationships into a traversable project graph.

Architecture:

- Tree-sitter extracts static dependency syntax behind a parser-neutral port.
- A catalog-bounded TypeScript adapter resolves project-local targets with compiler-compatible
  rules.
- Node built-ins, external packages, local files, and unresolved imports remain distinct.
- Extraction is reusable by source hash and query identity, while every edge is re-resolved against
  each current source catalog.
- Sequelize persists current file states, edges, bindings, run provenance, and freshness without
  source bodies or absolute target paths.
- A bounded, deterministic graph API traverses only fresh local relationships.

#### Milestone 4.3.1: Dependency Extraction Contracts and Query Packs

Status: Complete.

Goal: extract deterministic parser-neutral dependency declarations and bindings from JavaScript,
JSX, TypeScript, and TSX fixtures without resolution or persistence.

Delivered:

- Parser-neutral dependency, binding, range, limit, omission, and extraction-result types.
- `SourceDependencyExtractor` application port and class-based Tree-sitter adapter.
- Versioned JavaScript/JSX and TypeScript/TSX dependency query packs.
- Static ESM imports and re-exports, TypeScript type-only forms and import-equals, direct
  module-level CommonJS declarations, and static dynamic imports.
- Safe string-literal decoding, stable offset-independent dependency and binding identities, and
  exclusive UTF-8 byte ranges.
- Deterministic dependency, specifier, binding-count, and binding-name limits without truncation.
- Golden tests for all dialects, malformed syntax, Unicode, duplicates, exclusions, empty files,
  invalid specifiers, limits, and parser identities.

No module resolver, migration, Sequelize model, database write, API, Nest provider, or VSCode change
was introduced.

#### Milestone 4.3.2: Project-Aware Module Resolution

Status: Complete.

Goal: resolve extracted specifiers against an immutable source-catalog view with a proven
TypeScript compiler API adapter and strict project containment.

Delivered:

- Pinned backend `typescript@5.9.3` runtime with development and compiled compatibility smokes.
- Compiler-neutral resolver contracts and prepared resolution context.
- Catalog-only virtual filesystem that exposes file existence but reads only hash-verified compiler
  and package metadata.
- Nearest `tsconfig.json`/`jsconfig.json` selection, catalog-backed relative `extends`, safe
  fallbacks, and stable configuration warnings.
- TypeScript-compatible relative paths, extension substitution, path aliases, package `imports`,
  package self-name `exports`, and distinct import/require conditions.
- Local, built-in, external package, and unresolved classifications without absolute paths or
  failed-lookup persistence.
- Deterministic context hashing, strict project containment, metadata limits, and resolver caches.
- Focused fixtures and complete workspace verification.

No migration, Sequelize model, database write, index service, API, Nest provider, or VSCode change
was introduced.

#### Milestone 4.3.3: Durable Incremental Dependency Graph

Status: Complete.

Goal: atomically persist extraction states, re-resolved edges, bindings, freshness, and restart
recovery in local PostgreSQL.

Delivered:

- Dependency index/status contracts with stable run, file, warning, limit, and error vocabularies.
- Migration and class-based Sequelize models for dependency runs, file states, edges, and bindings.
- Fresh source-catalog reads with bounded, hash-verified compiler and package metadata.
- Changed-file safe reads and hash verification before Tree-sitter extraction.
- Hash and effective-extractor-identity reuse with zero code reads and parses for unchanged files.
- Full edge re-resolution against every current source catalog, including reused declarations.
- Deterministic per-file and total edge/binding limits with periodic event-loop yields.
- Stable file, edge, and binding UUIDs through atomic upserts and run-identity cleanup.
- One-transaction graph publication preserving the previous graph after rollback or interruption.
- Restart recovery for abandoned running dependency indexes.
- Explicit dependency index and status REST endpoints with stable `400`, `404`, `409`, and `503`
  behavior.
- Focused contracts, service, Sequelize repository, controller, configuration, privacy, rollback,
  and recovery tests.

No public graph traversal, local PostgreSQL acceptance command, automatic indexing, or VSCode
dependency controls were introduced; those remain Milestones 4.3.4 and 4.5.

#### Milestone 4.3.4: Graph Traversal and Acceptance

Status: Complete.

Delivered:

- Strict graph query and response contracts for portable paths, direction, depth, dependency and
  resolution filters, node and edge bounds, optional bindings, typed nodes, and truncation state.
- `GET /projects/:projectId/dependencies/graph` with stable `400`, `404`, `409`, and `503`
  behavior.
- Deterministic breadth-first incoming, outgoing, and bidirectional traversal over immutable
  dependency-run rows.
- Cycle safety, local-only expansion, terminal external and built-in nodes, targetless unresolved
  edges, configurable server ceilings, and periodic event-loop yields.
- Run-scoped Sequelize graph reads with deterministic sorting, filter pushdown, optional binding
  loading, excluded-edge tracking, and `limit + 1` truncation detection.
- `pnpm dependency:index:verify` using a temporary project and local PostgreSQL to prove supported
  dialects, target addition/removal, alias retargeting without importer reparsing, stable UUIDs,
  stale rejection, limits, rollback, recovery, privacy, and cleanup.
- Complete verification with 296 tests, TypeScript build, strict lint, formatting, native parser
  and resolver smokes, webview type-check, and production builds.

Milestone 4.3 is complete. Framework interpretation begins in Milestone 4.4; VSCode dependency
controls remain Milestone 4.5.

### Milestone 4.4: Framework Understanding

Status: In progress. Milestones 4.4.1 and 4.4.2 are complete.

Goal: combine fresh source, symbol, and dependency catalogs into an evidence-backed understanding
of NestJS, Express, Next.js, React, and Sequelize project structures.

Architecture:

- A separate durable framework catalog preserves the language-neutral symbol and dependency
  boundaries.
- Exact package/import evidence and documented file conventions activate analyzers.
- Hash-verified source is parsed transiently once per changed file; no framework package or project
  code is executed.
- Unchanged syntax evidence is reusable, while every cross-file relationship is relinked against
  the exact current symbol and dependency runs.
- Framework entities and relationships retain static evidence, stable identities, bounded
  attributes, source provenance, and explicit unresolved state.
- Atomic Sequelize publication, freshness, limits, recovery, privacy, bounded queries, and local
  PostgreSQL acceptance follow the established source-intelligence model.

#### Milestone 4.4.1: Framework Evidence Foundation and Scope Detection

Status: Complete.

Goal: add framework-neutral evidence contracts, exact package/import-backed scope detection,
shared parser/query infrastructure, stable identities, limits, and current symbol/dependency read
ports without extracting framework-specific entities.

Delivered:

- Hash-verified nearest-package framework scopes for root projects and monorepos.
- Exact package and import-binding activation for NestJS, Express, Next.js, React, and Sequelize,
  including alias preservation and type-only/local/unrelated rejection.
- A parser-neutral evidence port and class-based Tree-sitter implementation for bounded
  decorators, calls, class heritage, JSX, directives, and static values.
- Versioned dialect-specific query identities, stable offset-independent evidence keys, exclusive
  UTF-8 ranges, malformed syntax tolerance, deterministic limits, and source-body privacy.
- Paged immutable-run readers for current symbol records and dependency edges/bindings.
- Development and compiled native compatibility smokes.
- Complete repository verification with 70 test files and 316 passing tests.

No framework-specific entity extraction, migration, persistence, API, or VSCode change was added.

#### Milestone 4.4.2: NestJS Analyzer

Status: Complete.

Goal: detect evidence-backed NestJS modules, controllers, providers, routes, static module
metadata, and injection relationships.

Delivered:

- Framework-neutral transient entity/relationship facts, certainty and omission contracts,
  analyzer limits, and stable identity generation.
- Exact `@nestjs/common` named-alias and namespace binding resolution without decorator-name
  heuristics.
- NestJS modules, controllers, injectable and registered providers, all standard HTTP route
  decorators, static path arrays, and normalized controller/method route composition.
- Static module imports, controllers, providers, custom provider tokens, and exports with
  same-file links and dependency-edge provenance.
- Explicit `@Inject` tokens and typed constructor injection with owner, parameter, symbol, and
  import provenance.
- Explicit unresolved output for dynamic paths, module factories, spread/computed metadata, and
  runtime tokens.
- Complete repository verification with 71 test files and 324 passing tests.

No persistence, migration, endpoint, Express, Next.js, React, Sequelize, or VSCode change was
added.

#### Milestone 4.4.3: Express Analyzer

Status: Complete.

Goal: detect Express applications, routers, routes, middleware, error middleware, and statically
linked router mounts.

Delivered:

- Exact `express` default, namespace, named `Router`, CommonJS, and alias binding resolution.
- Transient application/router, standard direct and chained HTTP route, and middleware facts.
- Static normalized string/array paths plus explicit unresolved dynamic-path facts and omissions.
- Direct four-parameter error-middleware classification and named handler symbol linking.
- Same-file router links and local dependency-edge router-mount provenance.
- Coverage for aliases, ESM/CommonJS forms, chains, mounts, dynamic values, limits, stable keys,
  source privacy, false positives, and native smoke compatibility.

No persistence, migration, endpoint, Next.js, React, Sequelize, or VSCode change was added.

#### Milestone 4.4.4: Next.js and React Analyzers

Status: Complete.

Goal: detect App Router and Pages Router conventions, route handlers, client boundaries,
evidence-backed React components, and statically linked JSX composition.

Delivered:

- App Router and Pages Router file conventions, including `src` roots, nested/index routes,
  route groups, dynamic/catch-all segments, special pages, API routes, and static route handlers.
- Explicit unresolved intercepting routes plus private-folder exclusion and client-boundary facts.
- Exported JSX-backed React components, direct `memo`/`forwardRef` wrappers, local render links,
  and dependency-backed imported render links; lowercase intrinsic tags remain excluded.

No Sequelize, persistence, migration, endpoint, or VSCode change was added.

#### Milestone 4.4.5: Sequelize Analyzer

Status: Planned.

Goal: detect class-based and factory-style Sequelize models, bounded static attributes/options,
and standard associations, including the user's legacy `associate(models)` pattern.

#### Milestone 4.4.6: Durable Incremental Framework Catalog

Status: Planned.

Goal: atomically persist fresh framework scopes, file outcomes, entities, relationships,
provenance, limits, and recovery with incremental evidence reuse and full relinking.

#### Milestone 4.4.7: Framework Catalog Query and Acceptance

Status: Planned.

Goal: expose bounded fresh framework-catalog queries and prove multi-framework behavior,
incremental relinking, identity, atomicity, privacy, recovery, and cleanup against local
PostgreSQL.

Each sub-milestone requires explicit approval and must compile and pass independently. The complete
design is in `docs/milestone-4.4-architecture.md`.

### Milestone 4.5: Source Intelligence Integration and Acceptance

Status: Planned.

Goal: add explicit VSCode indexing controls, progress, durable status, and final Milestone 4
acceptance.
