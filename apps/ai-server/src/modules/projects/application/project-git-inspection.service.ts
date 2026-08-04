import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import type { Project } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import { PROJECT_REPOSITORY } from "../projects.constants.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";

const execFileAsync = promisify(execFile);

@Injectable()
export class ProjectGitInspectionService {
  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async status(projectId: string, signal: AbortSignal): Promise<unknown> {
    return this.inspect(projectId, ["status", "--short", "--branch", "--untracked-files=normal"], signal);
  }

  public async diff(
    projectId: string,
    path: string | undefined,
    staged: boolean,
    signal: AbortSignal,
  ): Promise<unknown> {
    const relativePath = path === undefined ? undefined : this.pathNormalizer.normalize(path);
    return this.inspect(
      projectId,
      [
        "diff",
        "--no-ext-diff",
        "--unified=3",
        ...(staged ? ["--cached"] : []),
        ...(relativePath === undefined ? [] : ["--", relativePath]),
      ],
      signal,
      relativePath,
    );
  }

  public async log(projectId: string, limit: number, signal: AbortSignal): Promise<unknown> {
    return this.inspect(projectId, ["log", "--no-color", `--max-count=${String(limit)}`, "--oneline", "--decorate"], signal);
  }

  public async show(projectId: string, ref: string, signal: AbortSignal): Promise<unknown> {
    if (!isGitRef(ref)) {
      return unavailable("invalid_ref");
    }

    return this.inspect(projectId, ["show", "--no-ext-diff", "--format=medium", "--stat", ref], signal);
  }

  public async branches(projectId: string, signal: AbortSignal): Promise<unknown> {
    return this.inspect(projectId, ["branch", "--no-color", "--all"], signal);
  }

  public async blame(
    projectId: string,
    path: string,
    startLine: number,
    endLine: number,
    signal: AbortSignal,
  ): Promise<unknown> {
    const relativePath = this.pathNormalizer.normalize(path);
    if (startLine > endLine) {
      return unavailable("range_invalid");
    }

    return this.inspect(
      projectId,
      ["blame", "--line-porcelain", "-L", `${String(startLine)},${String(endLine)}`, "--", relativePath],
      signal,
      relativePath,
      { endLine, path: relativePath, startLine },
    );
  }

  private async inspect(
    projectId: string,
    args: readonly string[],
    signal: AbortSignal,
    path?: string,
    citation?: { readonly path: string; readonly startLine: number; readonly endLine: number },
  ): Promise<unknown> {
    this.throwIfCancelled(signal);
    const project = await this.findProject(projectId);
    if (project === undefined) {
      return unavailable("project_not_found");
    }
    if (!(await this.isRepositoryRoot(project, signal))) {
      return unavailable("git_repository_unavailable");
    }

    try {
      const output = await this.runGit(project.rootPath, args, signal);
      return {
        available: true,
        ...(citation === undefined ? {} : { citation }),
        ...(path === undefined ? {} : { path }),
        output: output.content,
        truncated: output.truncated,
      };
    } catch {
      this.throwIfCancelled(signal);
      return unavailable("git_unavailable");
    }
  }

  private async isRepositoryRoot(project: Project, signal: AbortSignal): Promise<boolean> {
    try {
      const result = await this.runGit(project.rootPath, ["rev-parse", "--show-toplevel"], signal);
      return (await realpath(result.content.trim())) === project.rootPath;
    } catch {
      this.throwIfCancelled(signal);
      return false;
    }
  }

  private async runGit(
    rootPath: string,
    args: readonly string[],
    signal: AbortSignal,
  ): Promise<{ readonly content: string; readonly truncated: boolean }> {
    const maxOutputChars = this.config.workspaceTools.maxGitOutputChars;
    const result = await execFileAsync("git", [...args], {
      cwd: rootPath,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: maxOutputChars * 4,
      signal,
    });
    const content = `${result.stdout}${result.stderr}`.trim();
    return {
      content: content.slice(0, maxOutputChars),
      truncated: content.length > maxOutputChars,
    };
  }

  private async findProject(projectId: string): Promise<Project | undefined> {
    return (await this.projectRepository.findById(projectId)) ?? undefined;
  }

  private throwIfCancelled(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error("Arc Git inspection was cancelled.");
    }
  }
}

function unavailable(reason: string): { readonly available: false; readonly reason: string } {
  return { available: false, reason };
}

function isGitRef(value: string): boolean {
  return value.length > 0 && value.length <= 160 && !value.startsWith("-") && /^[A-Za-z0-9_./@{}^~-]+$/u.test(value);
}
