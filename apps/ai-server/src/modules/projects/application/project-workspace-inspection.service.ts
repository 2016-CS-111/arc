import { lstat, opendir } from "node:fs/promises";
import { resolve } from "node:path";

import type { Project } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import { PROJECT_REPOSITORY, SOURCE_TEXT_READER } from "../projects.constants.js";
import type { ProjectIgnoreEvaluator } from "./project-ignore.evaluator.js";
import { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";
import type { SourceTextReader } from "./source-text.reader.js";

export type WorkspaceSearchMode = "text" | "regex" | "filename";

export interface WorkspaceCitation {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface WorkspaceSearchMatch {
  readonly citation: WorkspaceCitation;
  readonly preview: string;
}

@Injectable()
export class ProjectWorkspaceInspectionService {
  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ProjectIgnorePolicyService)
    private readonly ignorePolicy: ProjectIgnorePolicyService,
    @Inject(ProjectPathNormalizer)
    private readonly pathNormalizer: ProjectPathNormalizer,
    @Inject(SOURCE_TEXT_READER)
    private readonly sourceTextReader: SourceTextReader,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async list(projectId: string, path: string | undefined, signal: AbortSignal): Promise<unknown> {
    const project = await this.findProject(projectId);
    if (project === undefined) {
      return unavailable("project_not_found");
    }

    const relativePath = path === undefined ? "" : this.pathNormalizer.normalize(path);
    const directoryPath = resolve(project.rootPath, relativePath);
    try {
      const metadata = await lstat(directoryPath);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        return unavailable("directory_not_found");
      }

      const evaluator = this.ignorePolicy.createEvaluator(project);
      const entries: { readonly name: string; readonly path: string; readonly kind: "file" | "directory" }[] = [];
      const directory = await opendir(directoryPath);
      let entryChars = 0;
      let truncated = false;
      try {
        for await (const entry of directory) {
          this.throwIfCancelled(signal);
          if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
            continue;
          }

          const entryPath = relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
          const kind = entry.isDirectory() ? "directory" : "file";
          const decision = await evaluator.check({ kind, path: entryPath });
          if (decision.ignored) {
            continue;
          }
          const entryCharsToAdd = entry.name.length + entryPath.length + 32;
          if (entries.length >= this.config.workspaceTools.maxEntries || entryChars + entryCharsToAdd > this.outputBudget) {
            truncated = true;
            break;
          }
          entries.push({ kind, name: entry.name, path: entryPath });
          entryChars += entryCharsToAdd;
        }
      } finally {
        await directory.close().catch(() => undefined);
      }

      entries.sort((left, right) => left.path.localeCompare(right.path));
      return {
        available: true,
        entries,
        path: relativePath,
        truncated,
      };
    } catch {
      this.throwIfCancelled(signal);
      return unavailable("directory_unavailable");
    }
  }

  public async read(
    projectId: string,
    path: string,
    startLine: number | undefined,
    endLine: number | undefined,
    signal: AbortSignal,
  ): Promise<unknown> {
    const project = await this.findProject(projectId);
    if (project === undefined) {
      return unavailable("project_not_found");
    }

    const relativePath = this.pathNormalizer.normalize(path);
    const evaluator = this.ignorePolicy.createEvaluator(project);
    const decision = await evaluator.check({ kind: "file", path: relativePath });
    if (decision.ignored) {
      return unavailable("path_ignored");
    }

    const source = await this.readSource(project, relativePath, signal);
    if (source === undefined) {
      return unavailable("file_unavailable");
    }

    const fromLine = startLine ?? 1;
    const lines = source.content.split(/\r?\n/u);
    const toLine = Math.min(endLine ?? lines.length, lines.length);
    if (fromLine > toLine) {
      return unavailable("range_invalid");
    }

    const content = lines.slice(fromLine - 1, toLine).join("\n");
    return {
      available: true,
      citation: {
        endLine: toLine,
        path: relativePath,
        startLine: fromLine,
      },
      content,
    };
  }

  public async search(
    projectId: string,
    query: string,
    mode: WorkspaceSearchMode,
    caseSensitive: boolean,
    signal: AbortSignal,
  ): Promise<unknown> {
    const project = await this.findProject(projectId);
    if (project === undefined) {
      return unavailable("project_not_found");
    }

    const evaluator = this.ignorePolicy.createEvaluator(project);
    const files = await this.collectFiles(project, evaluator, signal);
    const matches: WorkspaceSearchMatch[] = [];
    const matcher = mode === "regex" ? createRegex(query, caseSensitive) : undefined;
    if (mode === "regex" && matcher === undefined) {
      return unavailable("invalid_regex");
    }

    for (const path of files.paths) {
      this.throwIfCancelled(signal);
      if (matches.length >= this.maxMatches) {
        break;
      }

      if (mode === "filename") {
        if (includes(path, query, caseSensitive)) {
          matches.push({
            citation: { endLine: 1, path, startLine: 1 },
            preview: path,
          });
        }
        continue;
      }

      const source = await this.readSource(project, path, signal);
      if (source === undefined) {
        continue;
      }

      const position = mode === "text" ? findText(source.content, query, caseSensitive) : findRegex(source.content, matcher);
      if (position === -1) {
        continue;
      }

      const line = toLineNumber(source.content, position);
      matches.push({
        citation: { endLine: line, path, startLine: line },
        preview: toLinePreview(source.content, position),
      });
    }

    return {
      available: true,
      matches,
      mode,
      scannedFileCount: files.paths.length,
      truncated: files.truncated || matches.length >= this.maxMatches,
    };
  }

  private async collectFiles(
    project: Project,
    evaluator: ProjectIgnoreEvaluator,
    signal: AbortSignal,
  ): Promise<{ readonly paths: readonly string[]; readonly truncated: boolean }> {
    const paths: string[] = [];
    const directories: { readonly absolutePath: string; readonly relativePath: string }[] = [
      { absolutePath: project.rootPath, relativePath: "" },
    ];

    while (directories.length > 0 && paths.length < this.config.workspaceTools.maxSearchFiles) {
      this.throwIfCancelled(signal);
      const current = directories.shift();
      if (current === undefined) {
        break;
      }

      let directory;
      try {
        directory = await opendir(current.absolutePath);
      } catch {
        this.throwIfCancelled(signal);
        continue;
      }

      try {
        for await (const entry of directory) {
          this.throwIfCancelled(signal);
          if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
            continue;
          }

          const path = current.relativePath === "" ? entry.name : `${current.relativePath}/${entry.name}`;
          const kind = entry.isDirectory() ? "directory" : "file";
          const decision = await evaluator.check({ kind, path });
          if (decision.ignored) {
            continue;
          }

          if (entry.isDirectory()) {
            directories.push({ absolutePath: resolve(current.absolutePath, entry.name), relativePath: path });
            continue;
          }

          paths.push(path);
          if (paths.length >= this.config.workspaceTools.maxSearchFiles) {
            break;
          }
        }
      } finally {
        await directory.close().catch(() => undefined);
      }
    }

    return {
      paths,
      truncated: directories.length > 0 || paths.length >= this.config.workspaceTools.maxSearchFiles,
    };
  }

  private async readSource(project: Project, path: string, signal: AbortSignal): Promise<{ readonly content: string } | undefined> {
    this.throwIfCancelled(signal);
    try {
      const absolutePath = resolve(project.rootPath, path);
      const metadata = await lstat(absolutePath);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > this.maxReadBytes) {
        return undefined;
      }

      const result = await this.sourceTextReader.inspect({
        file: {
          modifiedAt: metadata.mtime.toISOString(),
          path,
          sizeBytes: metadata.size,
        },
        maxFileBytes: this.maxReadBytes,
        rootPath: project.rootPath,
      });
      return result.status === "ready" ? { content: result.content } : undefined;
    } catch {
      this.throwIfCancelled(signal);
      return undefined;
    }
  }

  private async findProject(projectId: string): Promise<Project | undefined> {
    return (await this.projectRepository.findById(projectId)) ?? undefined;
  }

  private get maxReadBytes(): number {
    return Math.min(this.config.workspaceTools.maxReadBytes, this.outputBudget);
  }

  private get maxMatches(): number {
    return Math.min(this.config.workspaceTools.maxMatches, 20);
  }

  private get outputBudget(): number {
    return Math.max(256, this.config.tools.maxResultChars - 512);
  }

  private throwIfCancelled(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error("Arc workspace inspection was cancelled.");
    }
  }
}

function unavailable(reason: string): { readonly available: false; readonly reason: string } {
  return { available: false, reason };
}

function includes(value: string, query: string, caseSensitive: boolean): boolean {
  return caseSensitive ? value.includes(query) : value.toLowerCase().includes(query.toLowerCase());
}

function findText(value: string, query: string, caseSensitive: boolean): number {
  return caseSensitive ? value.indexOf(query) : value.toLowerCase().indexOf(query.toLowerCase());
}

function createRegex(query: string, caseSensitive: boolean): RegExp | undefined {
  if (query.length > 256 || /[+*}]\s*[+*{]/u.test(query)) {
    return undefined;
  }

  try {
    return new RegExp(query, caseSensitive ? "u" : "iu");
  } catch {
    return undefined;
  }
}

function findRegex(value: string, matcher: RegExp | undefined): number {
  if (matcher === undefined) {
    return -1;
  }

  matcher.lastIndex = 0;
  const match = matcher.exec(value);
  return match?.index ?? -1;
}

function toLineNumber(value: string, position: number): number {
  return value.slice(0, position).split("\n").length;
}

function toLinePreview(value: string, position: number): string {
  const lineStart = value.lastIndexOf("\n", position) + 1;
  const lineEnd = value.indexOf("\n", position);
  const line = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  return line.slice(0, 160);
}
