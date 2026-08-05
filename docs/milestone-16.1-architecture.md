# Milestone 16.1 Architecture

## Threat Model

Arc is a single-user local tool. The local user controls the workspace, VS Code extension, Arc
backend, PostgreSQL, and Ollama. Project text, tool results, model output, package scripts, and
remote dependency registry responses are untrusted input. Arc must not treat that content as
instructions that override its execution or approval rules.

The key risks are unintended workspace or Git changes, unreviewed command execution, prompt
injection, secret disclosure through output or logs, runaway tool loops, lost approval state, and
outdated dependencies. Existing proposal previews, explicit confirmation, bounded tools, task
budgets, and durable agent-run recovery remain the primary controls.

## Permission Profiles

`review` is the default profile. It permits only read tools plus staging of edit, task, and memory
proposals. Applying edits and starting tasks still require their existing VS Code approval flows.

`read_only` prevents new proposals from being staged, including direct backend proposal services.
It leaves inspection, chat, status, and audit review available. The profile is selected with
`ARC_PERMISSION_PROFILE` before Arc starts.

## Audit and Redaction

`security_audit_events` stores category, action, status, IDs, and timestamps. Its schema has no
field for prompts, source text, diffs, tool arguments, tool results, task output, or error details.
Migration `0013_security_audit_events.sql` creates the table and indexes. The local audit endpoint
is bounded to 100 entries.

Shared log formatting and task output use common secret redaction. It masks usual token and
password key/value forms, Bearer headers, and URL passwords. It is a disclosure backstop, not a
reason to store secrets in Arc data.

## Dependency Audit

`pnpm security:dependencies` runs `pnpm audit --prod --audit-level=high`. It does not modify the
workspace, but package-manager audits can contact the configured registry and should be run by the
local user when network access is appropriate.
