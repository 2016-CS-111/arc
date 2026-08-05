# Milestone 16.3 Acceptance

## Automated Evidence

Run:

```sh
pnpm evaluation:verify
```

The command must report a passing result for retrieval, completion, edit, tool, and agent suites.
Each suite must complete within its reported local process budget. The command is deterministic and
does not contact PostgreSQL or Ollama.

## Manual Model Profile

1. Start Ollama and `pnpm backend:dev` with the desired `ARC_OLLAMA_MODEL`.
2. Open the Extension Development Host and accept several inline completions in a local TypeScript
   file after the model has warmed up.
3. On the documented 2019 Intel MacBook profile, confirm p50 completion latency is under 4 seconds
   for `qwen2.5-coder:3b` or under 8 seconds for `qwen2.5-coder:7b`.
4. Confirm a stalled completion stops after the configured 20-second timeout and does not modify the
   editor.

## Boundary

Local Ollama timing is a manual hardware profile, not a normal CI dependency. The deterministic
evaluation runner remains the release gate for application behavior.
