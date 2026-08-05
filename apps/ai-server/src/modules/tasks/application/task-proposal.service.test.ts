import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Project, TaskProposalApprovalRequest } from "@arc/contracts";
import type { AppConfig } from "../../../config/env.js";
import { describe, expect, it } from "vitest";

import type { ProjectIgnorePolicyService } from "../../projects/application/project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "../../projects/application/project-path.normalizer.js";
import type { ProjectRepository } from "../../projects/application/project.repository.js";
import type { LocalTaskProcessRunner } from "./local-task-process.runner.js";
import { TaskProposalService } from "./task-proposal.service.js";

const projectId = "c7d0da58-9f18-4d86-89d7-53c372d95472";
const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";

describe("TaskProposalService", () => {
  it("stages a detected package-manager preset and streams its result after approval", async () => {
    const rootPath = await createProjectRoot();
    const service = createService(rootPath, {
      run: (_command, _signal, onOutput) => {
        onOutput("tests passed\n");
        return Promise.resolve({ exitCode: 0 });
      },
    });

    try {
      const proposal = await service.propose({
        clientId: "socket_1",
        projectId,
        request: { preset: "test", type: "preset" },
        requestId: "request_1",
        sessionId,
      });

      expect(proposal).toMatchObject({
        approval: { kind: "standard", required: true },
        command: { args: ["run", "test"], executable: "pnpm" },
        mutates: false,
        status: "pending",
      });
      service.start(proposal.id, { confirmed: true });

      await expect(waitForTerminalStatus(service, proposal.id)).resolves.toMatchObject({
        output: "tests passed\n",
        status: "completed",
      });
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });

  it("cancels an approved task and keeps Git paths inside the project policy", async () => {
    const rootPath = await createProjectRoot();
    const service = createService(
      rootPath,
      {
        run: (_command, signal) =>
          new Promise((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                resolve({ exitCode: null });
              },
              { once: true },
            );
          }),
      },
      (path) => path === ".env",
    );

    try {
      await expect(
        service.propose({
          clientId: "socket_1",
          projectId,
          request: { git: { operation: "restore", paths: [".env"] }, type: "git" },
          requestId: "request_1",
          sessionId,
        }),
      ).rejects.toThrow("excluded by the project task policy");

      const proposal = await service.propose({
        clientId: "socket_1",
        projectId,
        request: { preset: "test", type: "preset" },
        requestId: "request_2",
        sessionId,
      });
      service.start(proposal.id, { confirmed: true });
      service.cancel(proposal.id);

      await expect(waitForTerminalStatus(service, proposal.id)).resolves.toMatchObject({ status: "cancelled" });
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });

  it("classifies Git work and refuses Docker or destructive package scripts", async () => {
    const rootPath = await createProjectRoot({
      clean: "rm -rf dist",
      container: "docker compose up",
      test: "vitest run",
    });
    const service = createService(rootPath, { run: () => Promise.resolve({ exitCode: 0 }) });

    try {
      await expect(
        service.propose({
          clientId: "socket_1",
          projectId,
          request: { script: "container", type: "package_script" },
          requestId: "request_3",
          sessionId,
        }),
      ).rejects.toThrow("does not stage Docker or destructive package scripts");
      await expect(
        service.propose({
          clientId: "socket_1",
          projectId,
          request: { script: "clean", type: "package_script" },
          requestId: "request_4",
          sessionId,
        }),
      ).rejects.toThrow("does not stage Docker or destructive package scripts");

      const proposal = await service.propose({
        clientId: "socket_1",
        projectId,
        request: { git: { operation: "restore", paths: ["src/example.ts"] }, type: "git" },
        requestId: "request_5",
        sessionId,
      });
      expect(proposal).toMatchObject({ approval: { kind: "destructive", required: true }, mutates: true });
      expect(() =>
        service.start(proposal.id, { confirmed: false } as unknown as TaskProposalApprovalRequest),
      ).toThrow();

      const packageScript = await service.propose({
        clientId: "socket_1",
        projectId,
        request: { script: "test", type: "package_script" },
        requestId: "request_6",
        sessionId,
      });
      expect(packageScript).toMatchObject({ approval: { kind: "workspace_write", required: true }, mutates: true });
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });
});

async function createProjectRoot(scripts: Record<string, string> = { test: "vitest run" }): Promise<string> {
  const rootPath = await mkdtemp(join(tmpdir(), "arc-tasks-"));
  await writeFile(join(rootPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(join(rootPath, "package.json"), JSON.stringify({ scripts }), "utf8");
  return rootPath;
}

function createService(
  rootPath: string,
  runner: Pick<LocalTaskProcessRunner, "run">,
  ignored: (path: string) => boolean = () => false,
): TaskProposalService {
  const project: Project = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: projectId,
    name: "Fixture",
    rootPath,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const projectRepository: ProjectRepository = {
    findById: () => Promise.resolve(project),
    register: () => Promise.reject(new Error("Project registration was not expected.")),
  };
  const ignorePolicy = {
    createEvaluator: () => ({
      check: ({ path }: { readonly path: string }) => Promise.resolve({ ignored: ignored(path) }),
    }),
  } as unknown as ProjectIgnorePolicyService;

  return new TaskProposalService(
    projectRepository,
    ignorePolicy,
    new ProjectPathNormalizer(),
    { tasks: { maxOutputChars: 12_000, timeoutMs: 10_000 } } as AppConfig,
    runner,
  );
}

function waitForTerminalStatus(
  service: TaskProposalService,
  proposalId: string,
): Promise<ReturnType<TaskProposalService["get"]>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.dispose();
      reject(new Error("Task did not reach a terminal status."));
    }, 1_000);
    const subscription = service.subscribe((event) => {
      if (
        event.proposal.id === proposalId &&
        event.proposal.status !== "pending" &&
        event.proposal.status !== "running"
      ) {
        clearTimeout(timeout);
        subscription.dispose();
        resolve(event.proposal);
      }
    });
  });
}
