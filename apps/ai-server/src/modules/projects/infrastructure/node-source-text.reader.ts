import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ProjectSourceFileSkipReason } from "@arc/contracts";

import type { SourceTextReader } from "../application/source-text.reader.js";
import type {
  SkippedSourceTextReadResult,
  SourceTextReadInput,
  SourceTextReadResult,
} from "../domain/project-source-index.types.js";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export class NodeSourceTextReader implements SourceTextReader {
  public async inspect(input: SourceTextReadInput): Promise<SourceTextReadResult> {
    const fallback = {
      inspectedBytes: 0,
      modifiedAt: input.file.modifiedAt,
      sizeBytes: input.file.sizeBytes,
    };

    try {
      const rootPath = await realpath(input.rootPath);
      const candidatePath = resolve(rootPath, input.file.path);
      if (!isWithinRoot(rootPath, candidatePath)) {
        return skipped("unsafe_path", fallback);
      }

      const ancestorReason = await this.findUnsafePathComponent(rootPath, input.file.path);
      if (ancestorReason !== null) {
        return skipped(ancestorReason, fallback);
      }

      const resolvedCandidate = await realpath(candidatePath);
      if (!isWithinRoot(rootPath, resolvedCandidate)) {
        return skipped("unsafe_path", fallback);
      }

      const expectedFile = await lstat(resolvedCandidate);
      if (!expectedFile.isFile()) {
        return skipped("not_regular_file", {
          ...fallback,
          modifiedAt: expectedFile.mtime.toISOString(),
          sizeBytes: expectedFile.size,
        });
      }
      if (!matchesInventory(input, expectedFile.size, expectedFile.mtimeMs)) {
        return skipped("inventory_stale", {
          ...fallback,
          modifiedAt: expectedFile.mtime.toISOString(),
          sizeBytes: expectedFile.size,
        });
      }
      if (expectedFile.size > input.maxFileBytes) {
        return skipped("file_too_large", {
          ...fallback,
          modifiedAt: expectedFile.mtime.toISOString(),
          sizeBytes: expectedFile.size,
        });
      }

      const handle = await open(candidatePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const beforeRead = await handle.stat();
        if (!beforeRead.isFile() || beforeRead.dev !== expectedFile.dev || beforeRead.ino !== expectedFile.ino) {
          return skipped("file_changed_during_read", {
            ...fallback,
            modifiedAt: beforeRead.mtime.toISOString(),
            sizeBytes: beforeRead.size,
          });
        }

        const bytes = await readBounded(handle, input.maxFileBytes);
        const afterRead = await handle.stat();
        const observed = {
          inspectedBytes: bytes.length,
          modifiedAt: afterRead.mtime.toISOString(),
          sizeBytes: afterRead.size,
        };

        if (bytes.length > input.maxFileBytes) {
          return skipped("file_too_large", observed);
        }
        if (
          beforeRead.dev !== afterRead.dev ||
          beforeRead.ino !== afterRead.ino ||
          beforeRead.size !== afterRead.size ||
          beforeRead.mtimeMs !== afterRead.mtimeMs ||
          bytes.length !== afterRead.size
        ) {
          return skipped("file_changed_during_read", observed);
        }
        if (bytes.includes(0)) {
          return skipped("binary_content", observed);
        }

        try {
          const content = utf8Decoder.decode(bytes);
          return {
            ...observed,
            content,
            contentHash: createHash("sha256").update(bytes).digest("hex"),
            status: "ready",
          };
        } catch {
          return skipped("invalid_utf8", observed);
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      return skipped(mapFileError(error), fallback);
    }
  }

  private async findUnsafePathComponent(
    rootPath: string,
    relativePath: string,
  ): Promise<ProjectSourceFileSkipReason | null> {
    const segments = relativePath.split("/");
    let currentPath = rootPath;

    for (const segment of segments) {
      currentPath = resolve(currentPath, segment);
      const metadata = await lstat(currentPath);
      if (metadata.isSymbolicLink()) {
        return "symbolic_link";
      }
    }

    return null;
  }
}

async function readBounded(handle: Awaited<ReturnType<typeof open>>, maxFileBytes: number): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(maxFileBytes);
  let offset = 0;

  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) {
      break;
    }
    offset += bytesRead;
  }

  return buffer.subarray(0, offset);
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

function matchesInventory(input: SourceTextReadInput, sizeBytes: number, modifiedAtMs: number): boolean {
  const expectedModifiedAtMs = new Date(input.file.modifiedAt).getTime();
  return input.file.sizeBytes === sizeBytes && Math.abs(expectedModifiedAtMs - modifiedAtMs) < 2;
}

function skipped(
  skipReason: ProjectSourceFileSkipReason,
  metadata: Omit<SkippedSourceTextReadResult, "skipReason" | "status">,
): SkippedSourceTextReadResult {
  return {
    ...metadata,
    skipReason,
    status: "skipped",
  };
}

function mapFileError(error: unknown): ProjectSourceFileSkipReason {
  if (!isNodeError(error)) {
    return "file_read_error";
  }
  if (error.code === "ENOENT") {
    return "file_missing";
  }
  if (error.code === "ELOOP") {
    return "symbolic_link";
  }
  return "file_read_error";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
