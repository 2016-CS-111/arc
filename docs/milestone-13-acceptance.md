# Milestone 13 Acceptance

Run `pnpm backend:dev`, `pnpm extension:watch`, and `pnpm extension:run`, then open a local TypeScript file in the Extension Development Host.

- Confirm `Arc: Inline Completions` is enabled in VS Code settings.
- Pause after a partial expression or function body and accept the ghost-text suggestion with the normal VS Code accept command.
- Type again while a request is pending; the previous request must disappear without altering the document.
- Disable `arc.inlineCompletions.enabled`; no backend completion request should be made.

The focused local quality corpus is the unit coverage for TypeScript imports, declarations, prefix/suffix bounds, repeated suffix removal, and Ollama FIM payloads. On the 2019 Intel MacBook profile, use p50 under 4 seconds for `qwen2.5-coder:3b` and under 8 seconds for `qwen2.5-coder:7b`; completions time out after 20 seconds and never leave the machine.
