import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { IgnoreRulesFileTooLargeError, InvalidProjectPathError } from "../domain/project.errors.js";
import { NodeIgnoreRulesFileReader } from "./node-ignore-rules-file.reader.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("NodeIgnoreRulesFileReader", () => {
  it("reads regular ignore files and treats missing files and symlinks as absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-ignore-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "packages"));
    await writeFile(join(root, ".gitignore"), "dist/\n");
    await symlink(join(root, ".gitignore"), join(root, "packages", ".gitignore"));
    const reader = new NodeIgnoreRulesFileReader();

    await expect(reader.read(root, ".gitignore")).resolves.toBe("dist/\n");
    await expect(reader.read(root, ".arcignore")).resolves.toBeNull();
    await expect(reader.read(root, "packages/.gitignore")).resolves.toBeNull();
  });

  it("rejects escaping and oversized rule files", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-ignore-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, ".arcignore"), "x".repeat(1024 * 1024 + 1));
    const reader = new NodeIgnoreRulesFileReader();

    await expect(reader.read(root, "../.gitignore")).rejects.toBeInstanceOf(InvalidProjectPathError);
    await expect(reader.read(root, ".arcignore")).rejects.toBeInstanceOf(IgnoreRulesFileTooLargeError);
  });
});
