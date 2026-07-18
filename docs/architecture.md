# Architecture

Arc is intentionally split into three independently evolvable components.

```mermaid
flowchart TD
  Extension["VSCode Extension"] --> Backend["AI Backend Server"]
  Backend --> Models["Ollama / llama.cpp"]
  Backend --> VectorStore["PostgreSQL + pgvector"]
  Backend --> Cache["Redis"]
  Backend --> Workspace["Files / Git / Terminal"]
```

## VSCode Extension

The extension is a thin product adapter. It owns VSCode-specific UX and permissions:

- Chat panel and webview UI.
- Inline completion provider.
- Code actions.
- Diff preview and approval UI.
- Workspace identity and editor state.

The extension must not own LLM orchestration, memory, embedding, or tool execution policy.

## AI Backend Server

The NestJS backend is the durable product core. It owns:

- LLM provider orchestration.
- Prompt and context assembly.
- Tool calling.
- Repository indexing.
- Semantic search.
- Memory.
- Git and terminal adapters.
- Permission enforcement.

Milestone 1 exposes a `/health` endpoint and a Socket.IO gateway so clients can verify the
backend is reachable before chat features are added.

## Inference Provider Boundary

Milestone 2.1 introduces an `InferenceModule` with a provider-neutral `ChatModelPort`. The
application layer exchanges messages, text deltas, completion metadata, readiness states, and typed
errors only. Ollama's HTTP endpoints and newline-delimited JSON stream format are contained inside
the Ollama adapter.

This keeps the backend's future chat orchestration independent from a specific inference runtime.
Ollama is the first adapter; llama.cpp or another local provider can implement the same port without
changing the caller. The backend liveness endpoint remains separate from Ollama readiness at
`/providers/ollama/status`, so clients can distinguish a stopped Arc server from an unavailable or
misconfigured model.

## Streaming Chat Protocol

Milestone 2.2 adds a dedicated Socket.IO `/chat` namespace. Clients submit `chat:send` and
`chat:cancel` commands, while the backend emits `chat:accepted`, `chat:delta`,
`chat:completed`, `chat:cancelled`, and `chat:error` events. Every event is correlated by request
and session identifier and validated with shared Zod contracts.

The `ChatGateway` owns transport concerns only. `SendChatMessageService` invokes the provider port,
and `ActiveGenerationRegistry` holds cancellable in-memory work for one connected client and
session. The registry is deliberately not a conversation store: completed messages disappear on
restart until durable sessions are added in Milestone 2.5.

## Webview Boundary

Milestone 2.3 gives the Arc activity-bar view a React and Tailwind UI that is bundled by Vite into
local extension assets. The webview has no network permission: it exchanges validated messages with
the extension host, which owns HTTP calls to the local backend. The initial bridge reports backend
and Ollama readiness only. It uses a nonce-based content security policy and allows scripts and
styles exclusively from the extension's generated webview assets.

## Ephemeral Chat State

Milestone 2.4.1 extends the webview bridge with validated chat lifecycle messages. The extension
host owns a single in-memory session, including request IDs, pending assistant placeholders, and
terminal generation states. A webview receives a hydration snapshot whenever it becomes ready, so
closing or reloading the view does not discard the Extension Host's temporary conversation.

This state is deliberately local and non-durable. The webview cannot open a transport connection or
choose correlation IDs; Socket.IO transport is added in Milestone 2.4.2, and persistent sessions
are deferred to Milestone 2.5.

## Extension Chat Transport

Milestone 2.4.2 introduces a provider-neutral `ChatTransportPort` in the extension host and a
Socket.IO implementation for the backend `/chat` namespace. The transport validates every backend
event against the shared contracts before the session controller can use it. The session controller
builds commands from its in-memory conversation, correlates events by request ID, and forwards only
normalized lifecycle updates to the webview.

The Socket.IO client connects lazily when the Arc view becomes ready and uses bounded automatic
reconnection. A disconnect fails the active local generation with a retryable error; it never
silently repeats a user prompt. The future composer and conversation presentation remain separate
work in Milestone 2.4.3.

## Local Infrastructure

Infrastructure is added only when a milestone needs it. PostgreSQL, pgvector, Redis, Ollama, and
embedding workers belong here, not inside the VSCode extension.

## Boundary Rule

The backend should be usable by future clients such as a CLI, web dashboard, JetBrains plugin, or
automation runner. VSCode is the first client, not the platform boundary.
