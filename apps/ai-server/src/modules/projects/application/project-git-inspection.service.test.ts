import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { Project } from "@arc/contracts";
import type { AppConfig } from "../../../config/env.js";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectGitInspectionService } from "./project-git-inspection.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRepository(): Promise<Project> {
  const rootPath = await mkdtemp(join(tmpdir(), "arc-git-"));
  roots.push(rootPath);
  await mkdir(join(rootPath, "src"));
  await writeFile(join(rootPath, "src", "main.ts"), "export const answer = 42;\n", "utf8");
  await execFileAsync("git", ["init"], { cwd: rootPath });
  await execFileAsync("git", ["config", "user.email", "arc@example.test"], { cwd: rootPath });
  await execFileAsync("git", ["config", "user.name", "Arc Test"], { cwd: rootPath });
  await execFileAsync("git", ["add", "src/main.ts"], { cwd: rootPath });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: rootPath });

  return {
    id: "0d2e5770-f08e-48d5-871b-36bf734f535c",
    name: "fixture",
    rootPath,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}

function createService(project: Project): ProjectGitInspectionService {
  const projectRepository = {
    findById: async (): Promise<Project> => project,
  } as ProjectRepository;
  return new ProjectGitInspectionService(
    projectRepository,
    new ProjectPathNormalizer(),
    { workspaceTools: { maxGitOutputChars: 6_000 } } as AppConfig,
  );
}

describe("ProjectGitInspectionService", () => {
  it("reads Git state through a fixed non-mutating command allowlist", async () => {
    const project = await createRepository();
    const service = createService(project);
    const signal = new AbortController().signal;

    await expect(service.log(project.id, 5, signal)).resolves.toMatchObject({
      available: true,
      output: expect.stringContaining("Initial commit"),
    });
    await expect(service.blame(project.id, "src/main.ts", 1, 1, signal)).resolves.toMatchObject({
      available: true,
      citation: { path: "src/main.ts", startLine: 1, endLine: 1 },
      output: expect.stringContaining("author Arc Test"),
    });
    await expect(service.show(project.id, "--upload-pack=bad", signal)).resolves.toEqual({
      available: false,
      reason: "invalid_ref",
    });
  });

  it("refuses Git repositories whose root escapes the registered project", async () => {
    const project = await createRepository();
    const nestedRoot = join(project.rootPath, "src");
    const nestedProject = { ...project, rootPath: nestedRoot };
    const service = createService(nestedProject);

    await expect(service.status(nestedProject.id, new AbortController().signal)).resolves.toEqual({
      available: false,
      reason: "git_repository_unavailable",
    });
  });
});
