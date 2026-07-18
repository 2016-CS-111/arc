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

- PostgreSQL 16 Docker Compose development infrastructure.
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

Status: Not started.

Included:

- Extension synchronization with backend session snapshots.
- Create, reopen, rename, and delete session workflows.
- Compact session-history UI in the Arc view.

#### Milestone 2.5.5: Persistence Acceptance

Status: Not started.

Included:

- Repository integration tests against PostgreSQL.
- Restart-recovery and manual durable-session acceptance coverage.

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

Goal: complete the Local Chat MVP with safe rich rendering and production-quality failure handling.

Included:

- Sanitized Markdown and GitHub-flavored Markdown rendering.
- Fenced code blocks, syntax highlighting, and code-copy actions.
- Streaming-aware auto-scroll and responsive chat layout.
- Input and history limits.
- Reconnect behavior, timeout handling, and normalized user-facing errors.
- Logging that excludes prompt and response contents by default.
- Updated architecture, operating instructions, and manual test matrix.

Acceptance gate:

- Untrusted model output cannot inject scripts into the webview.
- Long responses and code blocks remain usable in narrow and wide VSCode layouts.
- Backend unavailable, Ollama unavailable, missing model, timeout, cancellation, and reconnect paths
  are manually verified.
- Full workspace build, test, lint, and format checks pass.

Milestone 2 is complete only after all six acceptance gates pass. Repository context, embeddings,
tool calling, file editing, memory, and autonomous execution remain outside this milestone.

## Milestone 3: Project Registration

Goal: allow the extension to register the active workspace with the backend.

Expected additions:

- Project identity.
- Workspace root registration.
- Ignore rules.
- Initial repository scan.
- Project metadata storage.
