# Milestone 16.6: Compatibility Matrix

Arc ships one Node/NestJS backend and one VSIX. The extension host runs inside VS Code, while the
backend uses portable Node APIs. PostgreSQL and Ollama remain separately installed local services.

## Baseline

Use Node 24, pnpm 11.20, VS Code 1.101 or later, PostgreSQL with pgvector, and a locally running
Ollama model. Keep `pg_dump` and `pg_restore` on `PATH` when using backup or restore. Use `.env`
rather than shell-specific inline environment assignments.

## Matrix

| Platform   | Architecture                   | Status          | Evidence and notes                                                                                                                                                                              |
| ---------- | ------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS      | Intel (`darwin/x64`)           | Verified        | Current local development machine: Node 24.18.1, workspace tests, production build, setup doctor, and VSIX packaging pass.                                                                      |
| macOS      | Apple Silicon (`darwin/arm64`) | Ready to verify | Node, VS Code, PostgreSQL, and Ollama provide native ARM builds. Run the acceptance commands before release.                                                                                    |
| Linux      | x64 and ARM64                  | Ready to verify | Use a supported Node 24 installation and local PostgreSQL/Ollama services. VS Code CLI must be on `PATH` for `pnpm extension:run`.                                                              |
| Windows 11 | x64                            | Ready to verify | Use PowerShell, install PostgreSQL tools on `PATH`, and install the VS Code `code` command. Project path normalization and task-process cancellation handle Windows paths and process behavior. |

`Verified` means Arc was exercised on that operating system. `Ready to verify` means the code and
dependencies use the same supported runtime path but have not been run on that operating system in
this workspace. It is not a release claim.

## Platform Boundaries

- `pnpm clean` uses Node filesystem APIs, not `rm -rf`.
- The backend launches PostgreSQL tools through `spawn`, passing connection settings through the
  environment; it does not rely on a POSIX shell.
- Backup and restore require the PostgreSQL client tools installed on the local machine.
- The VSIX includes the bundled extension host and webview assets. It has no platform-specific
  binaries.
- The optional task runner uses Windows-specific process termination only when `process.platform`
  is `win32`; Unix systems retain process-group termination.

## Release Rule

Before claiming a platform as verified, run the acceptance matrix in
[the Milestone 16.6 acceptance guide](milestone-16.6-acceptance.md) with local PostgreSQL, pgvector,
and Ollama. Record the Node, VS Code, PostgreSQL, Ollama, operating-system, and architecture
versions with the result.
