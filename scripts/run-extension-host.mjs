import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = resolve(rootDir, "apps/vscode-extension");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    console.error(`Failed to run "${command}".`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("pnpm", ["extension:build"]);

console.info(`Opening VSCode Extension Development Host for ${extensionDir}`);

run("code", ["--new-window", `--extensionDevelopmentPath=${extensionDir}`, rootDir]);
