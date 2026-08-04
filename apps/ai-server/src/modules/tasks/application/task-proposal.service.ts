import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { GitTaskOperation, Project, TaskCommand, TaskProposal, TaskProposalRequest } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import { ProjectIgnorePolicyService } from "../../projects/application/project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "../../projects/application/project-path.normalizer.js";
import type { ProjectRepository } from "../../projects/application/project.repository.js";
import { PROJECT_REPOSITORY } from "../../projects/projects.constants.js";
import { ProjectNotFoundError } from "../../projects/domain/project.errors.js";
import { LocalTaskProcessRunner } from "./local-task-process.runner.js";
import {
  TaskProposalConflictError,
  TaskProposalNotFoundError,
  TaskProposalStateError,
} from "../domain/task-proposal.errors.js";

interface StoredTaskProposal {
  readonly clientId: string;
  readonly proposal: TaskProposal;
  abortController: AbortController | undefined;
  cancelled: boolean;
}

export interface TaskProposalEvent {
  readonly clientId: string;
  readonly proposal: TaskProposal;
}

export interface TaskProposalSubscription {
  dispose(): void;
}

@Injectable()
export class TaskProposalService {
  private readonly listeners = new Set<(event: TaskProposalEvent) => void>();
  private readonly proposals = new Map<string, StoredTaskProposal>();

  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ProjectIgnorePolicyService)
    private readonly ignorePolicy: ProjectIgnorePolicyService,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
    @Inject(LocalTaskProcessRunner)
    private readonly processRunner: LocalTaskProcessRunner,
  ) {}

  public async propose(input: {
    readonly clientId: string;
    readonly projectId: string;
    readonly request: TaskProposalRequest;
    readonly requestId: string;
    readonly sessionId: string;
  }): Promise<TaskProposal> {
    const project = await this.requireProject(input.projectId);
    const resolved = await this.resolveCommand(project, input.request);
    const now = new Date().toISOString();
    const proposal: TaskProposal = {
      command: resolved.command,
      createdAt: now,
      durationMs: null,
      exitCode: null,
      id: randomUUID(),
      kind: input.request.type,
      mutates: resolved.mutates,
      output: "",
      projectId: project.id,
      requestId: input.requestId,
      sessionId: input.sessionId,
      status: "pending",
      title: resolved.title,
      truncated: false,
      updatedAt: now,
    };
    this.proposals.set(proposal.id, {
      abortController: undefined,
      cancelled: false,
      clientId: input.clientId,
      proposal,
    });
    return structuredClone(proposal);
  }

  public get(proposalId: string): TaskProposal {
    return structuredClone(this.requireProposal(proposalId).proposal);
  }

  public start(proposalId: string): TaskProposal {
    const stored = this.requireProposal(proposalId);
    if (stored.proposal.status !== "pending") {
      throw new TaskProposalStateError("This task proposal is no longer awaiting approval.");
    }
    stored.abortController = new AbortController();
    this.setStatus(stored, "running");
    this.publish(stored);
    void this.run(stored);
    return structuredClone(stored.proposal);
  }

  public reject(proposalId: string): TaskProposal {
    const stored = this.requireProposal(proposalId);
    if (stored.proposal.status !== "pending") {
      throw new TaskProposalStateError("This task proposal is no longer awaiting approval.");
    }
    this.setStatus(stored, "rejected");
    this.publish(stored);
    return structuredClone(stored.proposal);
  }

  public cancel(proposalId: string): TaskProposal {
    const stored = this.requireProposal(proposalId);
    if (stored.proposal.status === "pending") {
      stored.cancelled = true;
      this.setStatus(stored, "cancelled");
      this.publish(stored);
      return structuredClone(stored.proposal);
    }
    if (stored.proposal.status !== "running" || stored.abortController === undefined) {
      throw new TaskProposalStateError("This task proposal is not running.");
    }
    stored.cancelled = true;
    stored.abortController.abort();
    return structuredClone(stored.proposal);
  }

  public subscribe(listener: (event: TaskProposalEvent) => void): TaskProposalSubscription {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private async run(stored: StoredTaskProposal): Promise<void> {
    const controller = stored.abortController;
    if (controller === undefined) {
      return;
    }
    const startedAt = performance.now();
    const timeoutReason = new Error("Arc task timed out.");
    const timeout = setTimeout(() => {
      controller.abort(timeoutReason);
    }, this.config.tasks.timeoutMs);

    try {
      const result = await this.processRunner.run(stored.proposal.command, controller.signal, (content) => {
        this.appendOutput(stored, content);
      });
      stored.proposal.exitCode = result.exitCode;
      this.setStatus(stored, result.exitCode === 0 ? "completed" : "failed");
    } catch (error) {
      this.appendOutput(stored, error instanceof Error ? `${error.message}\n` : "Arc task runner failed.\n");
      this.setStatus(stored, "failed");
    } finally {
      clearTimeout(timeout);
      stored.proposal.durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (controller.signal.reason === timeoutReason) {
        this.setStatus(stored, "timed_out");
      } else if (stored.cancelled) {
        this.setStatus(stored, "cancelled");
      }
      stored.abortController = undefined;
      this.publish(stored);
    }
  }

  private appendOutput(stored: StoredTaskProposal, content: string): void {
    const remaining = this.config.tasks.maxOutputChars - stored.proposal.output.length;
    if (remaining <= 0) {
      if (!stored.proposal.truncated) {
        stored.proposal.truncated = true;
        this.touch(stored);
        this.publish(stored);
      }
      return;
    }
    stored.proposal.output += content.slice(0, remaining);
    if (content.length > remaining) {
      stored.proposal.truncated = true;
    }
    this.touch(stored);
    this.publish(stored);
  }

  private async resolveCommand(
    project: Project,
    request: TaskProposalRequest,
  ): Promise<{ readonly command: TaskCommand; readonly mutates: boolean; readonly title: string }> {
    switch (request.type) {
      case "preset":
        return this.resolvePreset(project, request.preset);
      case "package_script":
        return this.resolvePackageScript(project, request.script, request.script === "format");
      case "git":
        return this.resolveGitOperation(project, request.git);
    }
  }

  private async resolvePreset(
    project: Project,
    preset: "test" | "lint" | "typecheck" | "build" | "format",
  ): Promise<{ readonly command: TaskCommand; readonly mutates: boolean; readonly title: string }> {
    const script =
      preset === "typecheck" ? await this.findAvailableScript(project.rootPath, ["typecheck", "build"]) : preset;
    return this.resolvePackageScript(
      project,
      script,
      preset === "format",
      script === "typecheck" ? "Type-check" : titleCase(script),
    );
  }

  private async resolvePackageScript(
    project: Project,
    script: string,
    mutates: boolean,
    title = `Run ${script}`,
  ): Promise<{ readonly command: TaskCommand; readonly mutates: boolean; readonly title: string }> {
    if (!/^[A-Za-z0-9:_-]{1,120}$/u.test(script)) {
      throw new TaskProposalConflictError("Arc package scripts must use a simple script name.");
    }
    const manifest = await this.readPackageManifest(project.rootPath);
    if (manifest.scripts[script] === undefined) {
      throw new TaskProposalConflictError(`The project does not define a ${script} package script.`);
    }
    const packageManager = await this.detectPackageManager(project.rootPath);
    return {
      command: { args: ["run", script], cwd: project.rootPath, executable: packageManager },
      mutates,
      title,
    };
  }

  private async resolveGitOperation(
    project: Project,
    operation: GitTaskOperation,
  ): Promise<{ readonly command: TaskCommand; readonly mutates: true; readonly title: string }> {
    const command = (args: readonly string[]): TaskCommand => ({
      args: [...args],
      cwd: project.rootPath,
      executable: "git",
    });
    switch (operation.operation) {
      case "add": {
        const paths = await this.resolveGitPaths(project, operation.paths);
        return { command: command(["add", "--", ...paths]), mutates: true, title: "Git add" };
      }
      case "commit":
        return { command: command(["commit", "-m", operation.message]), mutates: true, title: "Git commit" };
      case "branch":
        this.assertSafeBranch(operation.name);
        return {
          command: command(["branch", operation.name]),
          mutates: true,
          title: `Create branch ${operation.name}`,
        };
      case "merge":
        this.assertSafeBranch(operation.branch);
        return {
          command: command(["merge", "--no-edit", operation.branch]),
          mutates: true,
          title: `Merge ${operation.branch}`,
        };
      case "restore": {
        const paths = await this.resolveGitPaths(project, operation.paths);
        return { command: command(["restore", "--source=HEAD", "--", ...paths]), mutates: true, title: "Git restore" };
      }
      case "stash":
        return {
          command: command(["stash", "push", ...(operation.message === undefined ? [] : ["-m", operation.message])]),
          mutates: true,
          title: "Git stash",
        };
    }
  }

  private async resolveGitPaths(project: Project, paths: readonly string[]): Promise<readonly string[]> {
    const evaluator = this.ignorePolicy.createEvaluator(project);
    const normalizedPaths: string[] = [];
    for (const path of paths) {
      const normalizedPath = this.pathNormalizer.normalize(path);
      const decision = await evaluator.check({ kind: "file", path: normalizedPath });
      if (decision.ignored) {
        throw new TaskProposalConflictError(`${normalizedPath} is excluded by the project task policy.`);
      }
      normalizedPaths.push(normalizedPath);
    }
    return normalizedPaths;
  }

  private assertSafeBranch(branch: string): void {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/u.test(branch) ||
      branch.includes("..") ||
      branch.endsWith("/") ||
      branch.endsWith(".")
    ) {
      throw new TaskProposalConflictError("Arc Git branch names must be safe refs.");
    }
  }

  private async findAvailableScript(rootPath: string, candidates: readonly string[]): Promise<string> {
    const manifest = await this.readPackageManifest(rootPath);
    const script = candidates.find((candidate) => manifest.scripts[candidate] !== undefined);
    if (script === undefined) {
      throw new TaskProposalConflictError("The project does not define a type-check or build package script.");
    }
    return script;
  }

  private async readPackageManifest(rootPath: string): Promise<{ readonly scripts: Record<string, string> }> {
    try {
      const value: unknown = JSON.parse(await readFile(join(rootPath, "package.json"), "utf8"));
      if (
        typeof value !== "object" ||
        value === null ||
        !("scripts" in value) ||
        typeof value.scripts !== "object" ||
        value.scripts === null
      ) {
        throw new Error("scripts unavailable");
      }
      const scripts = Object.fromEntries(
        Object.entries(value.scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
      return { scripts };
    } catch {
      throw new TaskProposalConflictError("Arc could not read this project's package scripts.");
    }
  }

  private async detectPackageManager(rootPath: string): Promise<"pnpm" | "yarn" | "npm"> {
    if (await exists(join(rootPath, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (await exists(join(rootPath, "yarn.lock"))) {
      return "yarn";
    }
    return "npm";
  }

  private async requireProject(projectId: string): Promise<Project> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }
    return project;
  }

  private requireProposal(proposalId: string): StoredTaskProposal {
    const proposal = this.proposals.get(proposalId);
    if (proposal === undefined) {
      throw new TaskProposalNotFoundError(proposalId);
    }
    return proposal;
  }

  private setStatus(stored: StoredTaskProposal, status: TaskProposal["status"]): void {
    stored.proposal.status = status;
    this.touch(stored);
  }

  private touch(stored: StoredTaskProposal): void {
    stored.proposal.updatedAt = new Date().toISOString();
  }

  private publish(stored: StoredTaskProposal): void {
    const event: TaskProposalEvent = { clientId: stored.clientId, proposal: structuredClone(stored.proposal) };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
