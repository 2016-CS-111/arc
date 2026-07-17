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

Goal: connect the VSCode chat panel to the backend and stream model output from Ollama.

Expected additions:

- React + Vite webview.
- Chat session contract.
- Backend chat module.
- Ollama provider adapter.
- Streaming response events.
- Manual connection checks.

## Milestone 3: Project Registration

Goal: allow the extension to register the active workspace with the backend.

Expected additions:

- Project identity.
- Workspace root registration.
- Ignore rules.
- Initial repository scan.
- Project metadata storage.
