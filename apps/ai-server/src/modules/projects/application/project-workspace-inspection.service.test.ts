import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Project } from "@arc/contracts";
import type { AppConfig } from "../../../config/env.js";
import { afterEach, describe, expect, it } from "vitest";

import type { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";
import { ProjectWorkspaceInspectionService } from "./project-workspace-inspection.service.js";
import { NodeSourceTextReader } from "../infrastructure/node-source-text.reader.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function createProject(rootPath: string): Project {
  return {
    id: "0d2e5770-f08e-48d5-871b-36bf734f535c",
    name: "fixture",
    rootPath,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}

function createService(project: Project, maxReadBytes = 8_192): ProjectWorkspaceInspectionService {
  const projectRepository = {
    findById: async (): Promise<Project> => project,
  } as ProjectRepository;
  const ignorePolicy = {
    createEvaluator: () => ({
      check: async ({ path }: { readonly path: string }) => ({ ignored: path.startsWith(".git/") || path === ".git" }),
    }),
  } as unknown as ProjectIgnorePolicyService;

  return new ProjectWorkspaceInspectionService(
    projectRepository,
    ignorePolicy,
    new ProjectPathNormalizer(),
    new NodeSourceTextReader(),
    {
      tools: { maxResultChars: 8_192 },
      workspaceTools: {
        maxEntries: 100,
        maxGitOutputChars: 6_000,
        maxMatches: 40,
        maxReadBytes,
        maxSearchFiles: 1_000,
      },
    } as AppConfig,
  );
}

describe("ProjectWorkspaceInspectionService", () => {
  it("lists and reads only non-ignored regular files inside the registered root", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-workspace-"));
    roots.push(root);
    await mkdir(join(root, "src"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "src", "main.ts"), "export const answer = 42;\n", "utf8");
    await writeFile(join(root, ".git", "config"), "secret", "utf8");
    await symlink("src/main.ts", join(root, "linked.ts"));
    const service = createService(createProject(root));
    const signal = new AbortController().signal;

    await expect(service.list(createProject(root).id, undefined, signal)).resolves.toMatchObject({
      available: true,
      entries: [{ kind: "directory", path: "src" }],
    });
    await expect(service.read(createProject(root).id, "src/main.ts", 1, 1, signal)).resolves.toEqual({
      available: true,
      citation: { path: "src/main.ts", startLine: 1, endLine: 1 },
      content: "export const answer = 42;",
    });
    await expect(service.read(createProject(root).id, "linked.ts", 1, 1, signal)).resolves.toEqual({
      available: false,
      reason: "file_unavailable",
    });
  });

  it("returns compact text, regex, and filename source citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-workspace-"));
    roots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "main.ts"), "const alpha = 1;\nconst beta = alpha;\n", "utf8");
    const service = createService(createProject(root));
    const signal = new AbortController().signal;

    await expect(service.search(createProject(root).id, "beta", "text", false, signal)).resolves.toMatchObject({
      available: true,
      matches: [{ citation: { path: "src/main.ts", startLine: 2, endLine: 2 }, preview: "const beta = alpha;" }],
    });
    await expect(service.search(createProject(root).id, "alpha\\s*=", "regex", false, signal)).resolves.toMatchObject({
      available: true,
      matches: [{ citation: { path: "src/main.ts", startLine: 1, endLine: 1 } }],
    });
    await expect(service.search(createProject(root).id, "main", "filename", false, signal)).resolves.toMatchObject({
      available: true,
      matches: [{ citation: { path: "src/main.ts" }, preview: "src/main.ts" }],
    });
  });

  it("skips oversized files and rejects paths that escape the project", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-workspace-"));
    roots.push(root);
    await writeFile(join(root, "large.ts"), "x".repeat(100), "utf8");
    const service = createService(createProject(root), 20);
    const signal = new AbortController().signal;

    await expect(service.read(createProject(root).id, "large.ts", 1, 1, signal)).resolves.toEqual({
      available: false,
      reason: "file_unavailable",
    });
    await expect(service.read(createProject(root).id, "../outside.ts", 1, 1, signal)).rejects.toThrow();
  });

  it("propagates cancellation to the tool runtime boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-workspace-"));
    roots.push(root);
    const service = createService(createProject(root));
    const controller = new AbortController();
    controller.abort();

    await expect(service.search(createProject(root).id, "anything", "text", false, controller.signal)).rejects.toThrow();
  });
});
