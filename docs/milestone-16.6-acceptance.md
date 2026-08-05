# Milestone 16.6: Compatibility Acceptance

Run this on each target platform before marking it verified.

## Prerequisites

1. Install Node 24, pnpm 11.20, VS Code 1.101 or later, PostgreSQL with pgvector, and Ollama.
2. Put `pg_dump`, `pg_restore`, and the VS Code `code` command on `PATH`.
3. Configure `.env` with a local database URL and installed Ollama chat, completion, and embedding
   models.

## Commands

```sh
pnpm install
pnpm clean
pnpm build
pnpm test
pnpm db:migrate
pnpm setup:doctor
pnpm extension:package
```

`pnpm setup:doctor` must report every configured dependency as passed. Install the produced VSIX,
start `pnpm backend:dev`, and open the extension in VS Code. Confirm a chat response streams and a
project task can be started and cancelled.

## Result Record

| Field                            | Record |
| -------------------------------- | ------ |
| Operating system and version     |        |
| CPU architecture                 |        |
| Node and pnpm versions           |        |
| VS Code version                  |        |
| PostgreSQL and pgvector versions |        |
| Ollama and model versions        |        |
| Command results                  |        |
| Extension chat/task result       |        |
| Issues or workarounds            |        |

Do not promote a `Ready to verify` matrix entry to `Verified` without a completed result record.
