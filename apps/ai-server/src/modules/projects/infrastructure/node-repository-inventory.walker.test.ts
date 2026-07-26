import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckProjectPathRequest, ProjectIgnoreDecision } from "@arc/contracts";
import { afterEach, describe, expect, it } from "vitest";

import type { ProjectIgnoreEvaluator } from "../application/project-ignore.evaluator.js";
import { NodeRepositoryInventoryWalker } from "./node-repository-inventory.walker.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const temporaryDirectories: string[] = [];

class TestIgnoreEvaluator implements ProjectIgnoreEvaluator {
  public constructor(private readonly ignoredPaths = new Set<string>()) {}

  public check(request: CheckProjectPathRequest): Promise<ProjectIgnoreDecision> {
    const ignored = this.ignoredPaths.has(request.path);
    return Promise.resolve({
      ignored,
      kind: request.kind,
      path: request.path,
      projectId,
      reason: {
        pattern: ignored ? request.path : null,
        source: ignored ? "gitignore" : "none",
        sourcePath: ignored ? ".gitignore" : null,
      },
    });
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("NodeRepositoryInventoryWalker", () => {
  it("collects deterministic metadata while skipping ignored paths and symlinks", async () => {
    const root = await createRoot();
    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "README.md"), "Arc");
    await writeFile(join(root, "src", "main.ts"), "export {};");
    await writeFile(join(root, "src", "ignored.log"), "ignored");
    await writeFile(join(root, "node_modules", "package.js"), "ignored");
    await symlink(join(root, "src"), join(root, "linked-src"));
    const walker = new NodeRepositoryInventoryWalker();

    const result = await walker.walk(root, new TestIgnoreEvaluator(new Set(["node_modules", "src/ignored.log"])), {
      maxDepth: 10,
      maxFiles: 100,
      maxTotalBytes: 1024,
    });

    expect(result.files.map((file) => file.path)).toEqual(["README.md", "src/main.ts"]);
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "README.md", sizeBytes: 3 }),
        expect.objectContaining({ path: "src/main.ts", sizeBytes: 10 }),
      ]),
    );
    expect(result.ignoredPathCount).toBe(2);
    expect(result.skippedSymlinkCount).toBe(1);
    expect(result.limitReasons).toEqual([]);
    expect(result.totalBytes).toBe(13);
  });

  it("stops before exceeding file-count and total-byte limits", async () => {
    const root = await createRoot();
    await writeFile(join(root, "a.txt"), "1234");
    await writeFile(join(root, "b.txt"), "5678");
    const walker = new NodeRepositoryInventoryWalker();

    await expect(
      walker.walk(root, new TestIgnoreEvaluator(), {
        maxDepth: 10,
        maxFiles: 1,
        maxTotalBytes: 1024,
      }),
    ).resolves.toMatchObject({
      files: [expect.objectContaining({ path: "a.txt" })],
      limitReasons: ["file_count"],
      totalBytes: 4,
    });
    await expect(
      walker.walk(root, new TestIgnoreEvaluator(), {
        maxDepth: 10,
        maxFiles: 100,
        maxTotalBytes: 3,
      }),
    ).resolves.toMatchObject({
      files: [],
      limitReasons: ["total_bytes"],
      totalBytes: 0,
    });
  });

  it("records a depth limit without descending into the directory", async () => {
    const root = await createRoot();
    await writeFile(join(root, "root.txt"), "root");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "hidden.txt"), "hidden");
    const walker = new NodeRepositoryInventoryWalker();

    await expect(
      walker.walk(root, new TestIgnoreEvaluator(), {
        maxDepth: 1,
        maxFiles: 100,
        maxTotalBytes: 1024,
      }),
    ).resolves.toMatchObject({
      files: [expect.objectContaining({ path: "root.txt" })],
      limitReasons: ["depth"],
    });
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-inventory-"));
  temporaryDirectories.push(root);
  return root;
}
