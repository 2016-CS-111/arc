import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InvalidProjectRootError } from "../domain/project.errors.js";
import { NodeWorkspaceRootResolver } from "./node-workspace-root.resolver.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("NodeWorkspaceRootResolver", () => {
  it("returns the canonical path for an existing directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arc-project-"));
    temporaryDirectories.push(directory);
    const resolver = new NodeWorkspaceRootResolver();

    await expect(resolver.resolveDirectory(directory)).resolves.toBe(await realpath(directory));
  });

  it("rejects relative, missing, and non-directory roots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arc-project-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "package.json");
    await writeFile(filePath, "{}");
    const resolver = new NodeWorkspaceRootResolver();

    await expect(resolver.resolveDirectory("relative/project")).rejects.toBeInstanceOf(InvalidProjectRootError);
    await expect(resolver.resolveDirectory(join(directory, "missing"))).rejects.toBeInstanceOf(InvalidProjectRootError);
    await expect(resolver.resolveDirectory(filePath)).rejects.toBeInstanceOf(InvalidProjectRootError);
  });
});
