# Milestone 16.3 Architecture

## Deterministic Evaluation Corpus

`pnpm evaluation:verify` runs the existing focused Vitest suites for retrieval, completion, staged
edits, tool execution, and agent runs. The suites use deterministic local fixtures, so the command
does not need PostgreSQL, Ollama, a project workspace, or a network connection.

The runner executes each suite separately and reports its duration. Retrieval, completion, edit,
and tool suites have a 10-second budget; the agent suite has a 15-second budget. The overall budget
is their 55-second sum. These broad process-level budgets catch substantial local regressions while
allowing TypeScript startup variance on supported developer machines.

## Model Profile

Model response quality and cold-start latency are intentionally not CI gates. They depend on the
installed Ollama model, local hardware, and whether the model is already resident. The manual Intel
MacBook profile retains completion p50 targets of under 4 seconds for `qwen2.5-coder:3b` and under
8 seconds for `qwen2.5-coder:7b`; the existing 20-second completion request timeout remains the
hard user-facing bound.

## Boundary

This gate does not introduce remote telemetry, benchmark persistence, model scoring, or a new
runtime service. The evaluation command is a local developer and release check over the application's
existing acceptance tests.
