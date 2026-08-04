import { spawn } from "node:child_process";

import type { TaskCommand } from "@arc/contracts";
import { Injectable } from "@nestjs/common";

export interface LocalTaskProcessResult {
  readonly exitCode: number | null;
}

@Injectable()
export class LocalTaskProcessRunner {
  public run(
    command: TaskCommand,
    signal: AbortSignal,
    onOutput: (content: string) => void,
  ): Promise<LocalTaskProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.args, {
        cwd: command.cwd,
        detached: process.platform !== "win32",
        env: process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let settled = false;
      let forceKill: NodeJS.Timeout | undefined;

      const stop = (): void => {
        const pid = child.pid;
        if (pid === undefined || child.killed) {
          return;
        }
        try {
          process.kill(process.platform === "win32" ? pid : -pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
        forceKill = setTimeout(() => {
          if (!child.killed) {
            try {
              process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        }, 2_000);
      };

      const cleanup = (): void => {
        if (forceKill !== undefined) {
          clearTimeout(forceKill);
        }
        signal.removeEventListener("abort", stop);
      };
      const complete = (result: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        result();
      };

      child.stdout.on("data", (chunk: Buffer) => {
        onOutput(chunk.toString("utf8"));
      });
      child.stderr.on("data", (chunk: Buffer) => {
        onOutput(chunk.toString("utf8"));
      });
      child.once("error", (error) => {
        complete(() => {
          reject(error);
        });
      });
      child.once("close", (exitCode) => {
        complete(() => {
          resolve({ exitCode });
        });
      });
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) {
        stop();
      }
    });
  }
}
