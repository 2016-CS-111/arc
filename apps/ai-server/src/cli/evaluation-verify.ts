import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createConsoleLogger } from "@arc/shared";

import { runEvaluationSuites } from "../evaluation/evaluation-runner.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const vitestEntry = resolve(workspaceRoot, "node_modules/vitest/vitest.mjs");

async function main(): Promise<void> {
  const logger = createConsoleLogger("evaluation-verify");
  const report = await runEvaluationSuites((suite) => runVitest(suite.testFile));

  logger.info("Arc evaluation report", { ...report });
  if (!report.passed) {
    throw new Error("Arc evaluation verification failed.");
  }
}

function runVitest(testFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vitestEntry, "run", testFile], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Vitest exited with code ${String(code)}.`));
    });
  });
}

main().catch((error: unknown) => {
  createConsoleLogger("evaluation-verify").error("Arc evaluation verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
