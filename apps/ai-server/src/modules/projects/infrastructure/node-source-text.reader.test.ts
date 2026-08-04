import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeSourceTextReader } from "./node-source-text.reader.js";

describe("NodeSourceTextReader", () => {
  let rootPath: string;
  const reader = new NodeSourceTextReader();

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), "arc-source-reader-"));
    await mkdir(join(rootPath, "src"));
  });

  afterEach(async () => {
    await rm(rootPath, { force: true, recursive: true });
  });

  it("returns exact-byte SHA-256 and transient UTF-8 content", async () => {
    const content = "export const arc = true;\n";
    const path = join(rootPath, "src", "main.ts");
    await writeFile(path, content);

    await expect(reader.inspect(await inputFor(rootPath, "src/main.ts", 1024))).resolves.toMatchObject({
      content,
      contentHash: createHash("sha256").update(content).digest("hex"),
      inspectedBytes: Buffer.byteLength(content),
      status: "ready",
    });
  });

  it("rejects binary, invalid UTF-8, and oversized files", async () => {
    await writeFile(join(rootPath, "nul.bin"), Buffer.from([0x61, 0x00, 0x62]));
    await writeFile(join(rootPath, "invalid.txt"), Buffer.from([0xc3, 0x28]));
    await writeFile(join(rootPath, "large.txt"), "12345");

    await expect(reader.inspect(await inputFor(rootPath, "nul.bin", 16))).resolves.toMatchObject({
      skipReason: "binary_content",
      status: "skipped",
    });
    await expect(reader.inspect(await inputFor(rootPath, "invalid.txt", 16))).resolves.toMatchObject({
      skipReason: "invalid_utf8",
      status: "skipped",
    });
    await expect(reader.inspect(await inputFor(rootPath, "large.txt", 4))).resolves.toMatchObject({
      inspectedBytes: 0,
      skipReason: "file_too_large",
      status: "skipped",
    });
  });

  it("never follows symbolic links", async () => {
    await writeFile(join(rootPath, "src", "real.ts"), "export {};\n");
    await symlink(join(rootPath, "src", "real.ts"), join(rootPath, "linked.ts"));

    await expect(
      reader.inspect({
        file: {
          modifiedAt: new Date().toISOString(),
          path: "linked.ts",
          sizeBytes: 0,
        },
        maxFileBytes: 1024,
        rootPath,
      }),
    ).resolves.toMatchObject({
      inspectedBytes: 0,
      skipReason: "symbolic_link",
      status: "skipped",
    });
  });

  it("rejects inventory metadata that changed before reading", async () => {
    const path = join(rootPath, "src", "stale.ts");
    await writeFile(path, "export const before = true;\n");
    const input = await inputFor(rootPath, "src/stale.ts", 1024);
    await writeFile(path, "changed\n");

    await expect(reader.inspect(input)).resolves.toMatchObject({
      inspectedBytes: 0,
      skipReason: "inventory_stale",
      status: "skipped",
    });
  });

  it("rejects escaping and missing paths without opening them", async () => {
    await expect(
      reader.inspect({
        file: {
          modifiedAt: new Date().toISOString(),
          path: "../outside.ts",
          sizeBytes: 1,
        },
        maxFileBytes: 1024,
        rootPath,
      }),
    ).resolves.toMatchObject({ skipReason: "unsafe_path" });
    await expect(
      reader.inspect({
        file: {
          modifiedAt: new Date().toISOString(),
          path: "missing.ts",
          sizeBytes: 1,
        },
        maxFileBytes: 1024,
        rootPath,
      }),
    ).resolves.toMatchObject({ skipReason: "file_missing" });
  });
});

async function inputFor(rootPath: string, relativePath: string, maxFileBytes: number) {
  const { lstat } = await import("node:fs/promises");
  const metadata = await lstat(join(rootPath, ...relativePath.split("/")));
  return {
    file: {
      modifiedAt: metadata.mtime.toISOString(),
      path: relativePath,
      sizeBytes: metadata.size,
    },
    maxFileBytes,
    rootPath,
  };
}
