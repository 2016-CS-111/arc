# Milestone 2.6 Acceptance Guide

Milestone 2.6 closes the Local Chat MVP. Run the automated gate first, then use the manual matrix
with local PostgreSQL, Ollama, the NestJS backend, and the VSCode Extension Development Host.

## Automated Gate

```sh
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm db:verify
```

The test suite covers Markdown sanitization, unsafe links and images, code actions, streamed update
batching, scroll-follow behavior, transport state transitions, bounded reconnect handling, timeout
normalization, cancellation, durable conversations, no prompt replay, and content-free lifecycle
logging.

## Start the Local Stack

Confirm that local PostgreSQL and Ollama are running and that the configured model is installed:

```sh
ollama list
pnpm db:migrate
```

Set `ARC_OLLAMA_MODEL=qwen2.5-coder:7b` in the root `.env`, then use separate terminals:

```sh
pnpm backend:dev
```

```sh
pnpm extension:watch
```

```sh
pnpm extension:run
```

In the Extension Development Host, run `Arc: Open Chat`. Continue when the header reports
`Connected` and the Ollama row reports `Ready`.

## Manual Matrix

| Area         | Scenario                | Procedure                                                                                                                    | Expected result                                                                                                              |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Local model  | Streaming               | Send a coding question with a multi-paragraph answer.                                                                        | Text arrives incrementally and completes once.                                                                               |
| Presentation | Rich Markdown           | Ask for headings, a table, a task list, and fenced TypeScript.                                                               | Markdown is structured, code is highlighted, and Copy works.                                                                 |
| Presentation | Narrow and wide layouts | Resize the Arc sidebar from its narrow minimum to a wide panel while viewing a long table and code block.                    | Text remains readable; tables and code scroll horizontally without overlapping controls.                                     |
| Presentation | Scroll follow           | Stream a long answer, scroll upward, then use the jump-to-latest action.                                                     | Manual review pauses following; the action resumes at the latest output.                                                     |
| Security     | Untrusted Markdown      | Ask the model to print `<script>alert(1)</script>`, an image, and a `javascript:` link as Markdown.                          | No script executes, no remote image loads, and the unsafe link is inert.                                                     |
| Backend      | Initially unavailable   | Stop the backend and open Arc.                                                                                               | Arc reaches `Offline`, the composer stays disabled, and no prompt is sent.                                                   |
| Reconnect    | Backend restart         | Start a prompt, stop the backend during generation, then restart it and use Reconnect.                                       | The active response fails once, Arc reconnects, and the old prompt is not replayed.                                          |
| Ollama       | Provider unavailable    | Keep the backend running but stop Ollama, refresh status, and send after restoring the connection if needed.                 | Status shows Ollama unavailable and generation reports a normalized retryable error.                                         |
| Ollama       | Missing model           | Start the backend with `ARC_OLLAMA_MODEL=arc-model-does-not-exist`.                                                          | Status shows `Model missing`; no internal provider details appear in chat.                                                   |
| Timeout      | Model timeout           | Temporarily start the backend with `ARC_OLLAMA_REQUEST_TIMEOUT_MS=1000` and send a request that cannot finish in one second. | The assistant ends with the normalized timeout message and the conversation remains usable.                                  |
| Cancellation | Stop                    | Start a long answer and select Stop.                                                                                         | The correlated generation becomes `Stopped` and no later delta changes it.                                                   |
| Durability   | Restart                 | Complete a turn, restart the backend and Extension Development Host, reopen the session, and send a follow-up.               | Prior messages remain and only the follow-up prompt is sent.                                                                 |
| Privacy      | Backend logs            | Send prompts containing a unique sentinel and inspect backend lifecycle logs.                                                | Logs contain request ID, session ID, duration, mode/status, and error code when applicable, but not prompt or response text. |

Restore the normal model and timeout values after the missing-model and timeout checks.

## Acceptance Result

Status: Passed on the target Intel Mac with local PostgreSQL, Ollama, `qwen2.5-coder:7b`, the
NestJS backend, and a VSCode Extension Development Host. The manual run was completed across
2026-07-25 and 2026-07-27.

The final regression run passed 33 test files and 99 tests, webview and workspace type-checks,
ESLint, Prettier, backend and webview production builds, Sequelize/PostgreSQL verification, direct
Ollama streaming, durable Socket.IO streaming, and correlated Socket.IO cancellation.

Observed results:

- Responses streamed incrementally and completed once through the real extension-to-backend-to-Ollama path.
- GFM headings, tables, task lists, fenced TypeScript, syntax highlighting, and code copy rendered
  correctly. The copy action placed `const answer = 42;` on the clipboard.
- Script markup remained text, Markdown images did not load, and `javascript:` links were inert.
- Narrow and wide layouts remained readable. A long-transcript regression found during acceptance
  was fixed by constraining the webview root to the viewport; the composer now remains pinned.
- Scrolling upward paused follow mode, displayed the jump-to-latest action, and that action restored
  the latest stopped turn.
- Backend loss produced the offline state and one failed turn. Manual reconnect restored the
  transport without replaying the old prompt, and a fresh prompt produced one generation lifecycle.
- Provider-unavailable, missing-model, and forced-timeout scenarios produced normalized states and
  errors without leaking provider internals.
- Selecting Stop produced `cancellation_requested` and `cancelled` lifecycle events for the same
  request in 2.3 seconds. The UI rendered `Stopped`, and no later completion changed the turn.
- Restarting both the backend and Extension Development Host restored both durable conversations.
  A new post-restart request was sent exactly once.
- Lifecycle logs contained correlation identifiers, durations, modes, statuses, and typed error
  codes without prompt or response content.

## Terminal Smoke Checks

With the normal backend and Ollama configuration restored:

```sh
pnpm ollama:smoke
pnpm chat:socket-smoke
pnpm chat:cancel-smoke
```

`ollama:smoke` verifies direct model streaming. `chat:socket-smoke` verifies the durable Socket.IO
path. `chat:cancel-smoke` succeeds only after the matching cancellation event.

Milestone 2 was accepted after the automated gate passed and every manual matrix row was observed
on the target local machine.
