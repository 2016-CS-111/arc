import type { Project } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { ProjectNotFoundError } from "../domain/project.errors.js";
import type { IgnoreRulesFileReader } from "./ignore-rules-file.reader.js";
import { ProjectIgnorePolicyService } from "./project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";

const project: Project = {
  createdAt: "2026-07-27T08:00:00.000Z",
  id: "03f4c07e-e890-454d-b557-17b780906ceb",
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-27T08:00:00.000Z",
};

class MemoryIgnoreRulesFileReader implements IgnoreRulesFileReader {
  public constructor(private readonly files: Readonly<Record<string, string>> = {}) {}

  public read(_rootPath: string, relativePath: string): Promise<string | null> {
    return Promise.resolve(this.files[relativePath] ?? null);
  }
}

function createService(files: Readonly<Record<string, string>> = {}): ProjectIgnorePolicyService {
  const repository = {
    findById: vi.fn(() => Promise.resolve(project)),
    register: vi.fn(),
  } satisfies ProjectRepository;

  return new ProjectIgnorePolicyService(
    repository,
    new MemoryIgnoreRulesFileReader(files),
    new ProjectPathNormalizer(),
  );
}

describe("ProjectIgnorePolicyService", () => {
  it.each([
    ["file", ".env.local", "built_in_safety", ".env.*"],
    ["file", "certificates/local.key", "built_in_safety", "*.key"],
    ["directory", "packages/api/node_modules", "built_in_generated", "node_modules/"],
    ["file", "coverage/report.json", "built_in_generated", "coverage/"],
  ] as const)("explains built-in exclusions for %s %s", async (kind, path, source, pattern) => {
    await expect(createService().check(project.id, { kind, path })).resolves.toMatchObject({
      ignored: true,
      kind,
      path,
      reason: { pattern, source, sourcePath: null },
    });
  });

  it("applies nested gitignore rules relative to their directories", async () => {
    const service = createService({
      ".gitignore": "*.log\n",
      "packages/api/.gitignore": "!keep.log\nartifacts/\n",
    });

    await expect(service.check(project.id, { kind: "file", path: "packages/api/debug.log" })).resolves.toMatchObject({
      ignored: true,
      reason: { pattern: "*.log", sourcePath: ".gitignore" },
    });
    await expect(service.check(project.id, { kind: "file", path: "packages/api/keep.log" })).resolves.toMatchObject({
      ignored: false,
      path: "packages/api/keep.log",
    });
    await expect(
      service.check(project.id, { kind: "directory", path: "packages/api/artifacts" }),
    ).resolves.toMatchObject({
      ignored: true,
      reason: { pattern: "artifacts/", sourcePath: "packages/api/.gitignore" },
    });
  });

  it("does not let a nested rule reinclude a path below an ignored parent", async () => {
    const service = createService({
      ".gitignore": "packages/\n",
      "packages/api/.gitignore": "!main.ts\n",
    });

    await expect(service.check(project.id, { kind: "file", path: "packages/api/main.ts" })).resolves.toMatchObject({
      ignored: true,
      reason: { pattern: "packages/", sourcePath: ".gitignore" },
    });
  });

  it("applies root Arc rules after Git rules as additional exclusions", async () => {
    const service = createService({
      ".arcignore": "fixtures/**\n!fixtures/keep.ts\n",
    });

    await expect(service.check(project.id, { kind: "file", path: "fixtures/data.json" })).resolves.toMatchObject({
      ignored: true,
      reason: { pattern: "fixtures/**", source: "arcignore", sourcePath: ".arcignore" },
    });
    await expect(service.check(project.id, { kind: "file", path: "fixtures/keep.ts" })).resolves.toMatchObject({
      ignored: false,
    });
  });

  it("does not let Arc rules override safety, generated, or Git exclusions", async () => {
    const service = createService({
      ".arcignore": "!.env.local\n!node_modules/\n!private/\n",
      ".gitignore": "private/\n",
    });

    await expect(service.check(project.id, { kind: "file", path: ".env.local" })).resolves.toMatchObject({
      ignored: true,
      reason: { source: "built_in_safety" },
    });
    await expect(service.check(project.id, { kind: "directory", path: "node_modules" })).resolves.toMatchObject({
      ignored: true,
      reason: { source: "built_in_generated" },
    });
    await expect(service.check(project.id, { kind: "file", path: "private/data.json" })).resolves.toMatchObject({
      ignored: true,
      reason: { source: "gitignore" },
    });
    await expect(service.check(project.id, { kind: "file", path: ".env.example" })).resolves.toMatchObject({
      ignored: false,
    });
  });

  it("normalizes the path returned to clients and rejects unknown projects", async () => {
    await expect(
      createService().check(project.id, { kind: "file", path: "./packages\\api//src/main.ts" }),
    ).resolves.toMatchObject({
      ignored: false,
      path: "packages/api/src/main.ts",
      reason: { source: "none" },
    });

    const repository = {
      findById: vi.fn(() => Promise.resolve(null)),
      register: vi.fn(),
    } satisfies ProjectRepository;
    const service = new ProjectIgnorePolicyService(
      repository,
      new MemoryIgnoreRulesFileReader(),
      new ProjectPathNormalizer(),
    );

    await expect(service.check(project.id, { kind: "file", path: "src/main.ts" })).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });
});
