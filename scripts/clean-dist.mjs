import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));

await rm(resolve(rootDir, "apps/ai-server/dist"), { force: true, recursive: true });
await rm(resolve(rootDir, "apps/vscode-extension/dist"), { force: true, recursive: true });
await rm(resolve(rootDir, "packages/contracts/dist"), { force: true, recursive: true });
await rm(resolve(rootDir, "packages/shared/dist"), { force: true, recursive: true });
