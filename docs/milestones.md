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

Goal: connect the webview, extension host, backend gateway, and Ollama adapter into one working chat
flow.

Included:

- Socket.IO client owned by the extension host.
- Chat composer and plain-text conversation view.
- Prompt submission, streaming deltas, completion, and stop-generation actions.
- Correlated transport between webview requests and backend stream events.
- Basic reconnect and actionable error states.
- End-to-end tests with a deterministic fake model plus a manual Ollama test.

Acceptance gate:

- A prompt entered in the Arc view streams a response from the configured local model.
- Stop generation cancels the corresponding backend request.
- Backend restarts and connection failures do not freeze the webview.
- Build, test, lint, and format checks pass.

Not included yet:

- Durable sessions.
- Rich Markdown and syntax highlighting.

### Milestone 2.5: Durable Chat Sessions

Goal: make the backend the source of truth for conversations and preserve chat history across
VSCode and backend restarts.

Included:

- PostgreSQL development infrastructure and migrations.
- Conversation repository port and PostgreSQL adapter.
- Chat session and message tables.
- Create, list, reopen, rename, and delete session operations.
- Persisted user, completed assistant, cancelled, and failed message states.
- Session history UI.
- Repository integration tests against PostgreSQL.

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
