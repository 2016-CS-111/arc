# Milestone 2.4 Operating Guide

Milestone 2.4 provides ephemeral local chat. The Extension Host owns the current session and the
Socket.IO connection; the NestJS server owns the active generation; Ollama owns inference. Closing
or reloading the Arc view preserves the in-memory session while the Extension Host remains alive.

## Start Locally

Ensure Ollama is running and the configured model is installed:

```sh
ollama list
```

Set `ARC_OLLAMA_MODEL=qwen2.5-coder:7b` in the root `.env`, then run these in separate terminals:

```sh
pnpm backend:dev
```

```sh
pnpm extension:watch
```

```sh
pnpm extension:run
```

In the `Extension Development Host`, use `Arc: Open Chat` from the Command Palette. Wait until the
header says `Connected` and the Ollama status is `Ready`.

## Manual Acceptance

1. Send a short prompt such as `Explain a TypeScript discriminated union in two sentences.`
2. Confirm the user message appears immediately, assistant text arrives incrementally, and the
   composer remains unavailable until the response completes.
3. Send a longer prompt, select Stop while it streams, and confirm the response shows `Stopped`.
4. Start another prompt, stop `pnpm backend:dev`, and confirm the active response becomes a failed
   message and the composer waits for the connection rather than sending automatically.
5. Restart `pnpm backend:dev`, wait for `Connected`, and send a new prompt manually. The failed
   request must not be replayed.

## Terminal Smoke Checks

Run these with the backend active:

```sh
pnpm ollama:smoke
pnpm chat:socket-smoke
pnpm chat:cancel-smoke
```

The first verifies direct Ollama streaming. The second verifies ordered Socket.IO tokens through
the backend. The last cancels immediately after `chat:accepted` and succeeds only after the matching
`chat:cancelled` event.

## Test Matrix

| Scenario                 | Automated coverage                                  | Manual verification                                      |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| Ordered token streaming  | Deterministic gateway-to-extension integration test | Prompt in Arc view                                       |
| Stop generation          | Abort-aware deterministic integration test          | Stop button and cancel smoke command                     |
| Model timeout            | Typed timeout-to-client-error integration test      | Optional, lower timeout only in a local test environment |
| Backend restart          | Controller reconnect/no-resend test                 | Stop and restart backend during a response               |
| Late or malformed events | Transport and stale-event controller tests          | Not required                                             |
| Duplicate generation     | Active-generation registry and no-resend tests      | Confirm a failed request is never replayed               |

The model response contents are not persisted in Milestone 2.4. Durable sessions, Markdown,
repository context, and file-edit tools remain later milestones.
