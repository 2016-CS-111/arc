import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectFileMetadata, ProjectScanLimitReason } from "@arc/contracts";

import type { ProjectIgnoreEvaluator } from "../application/project-ignore.evaluator.js";
import type { RepositoryInventoryWalker } from "../application/repository-inventory.walker.js";
import type { ProjectInventoryWalkResult, ProjectScanLimits } from "../domain/project-inventory.types.js";

interface DirectoryWorkItem {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly depth: number;
}

export class NodeRepositoryInventoryWalker implements RepositoryInventoryWalker {
  public async walk(
    rootPath: string,
    ignoreEvaluator: ProjectIgnoreEvaluator,
    limits: ProjectScanLimits,
  ): Promise<ProjectInventoryWalkResult> {
    const files: ProjectFileMetadata[] = [];
    const limitReasons = new Set<ProjectScanLimitReason>();
    const directories: DirectoryWorkItem[] = [{ absolutePath: rootPath, depth: 0, relativePath: "" }];
    let totalBytes = 0;
    let ignoredPathCount = 0;
    let skippedSymlinkCount = 0;
    let hardLimitReached = false;

    while (directories.length > 0 && !hardLimitReached) {
      const directory = directories.pop();
      if (directory === undefined) {
        break;
      }

      const entries = await readdir(directory.absolutePath, { withFileTypes: true });
      entries.sort((left, right) => compareNames(left.name, right.name));
      const childDirectories: DirectoryWorkItem[] = [];

      for (const entry of entries) {
        const relativePath = directory.relativePath === "" ? entry.name : `${directory.relativePath}/${entry.name}`;
        const absolutePath = join(directory.absolutePath, entry.name);
        const depth = directory.depth + 1;

        if (entry.isSymbolicLink()) {
          skippedSymlinkCount += 1;
          continue;
        }

        if (entry.isDirectory()) {
          const metadata = await lstat(absolutePath);
          if (metadata.isSymbolicLink()) {
            skippedSymlinkCount += 1;
            continue;
          }
          if (!metadata.isDirectory()) {
            continue;
          }

          const decision = await ignoreEvaluator.check({ kind: "directory", path: relativePath });
          if (decision.ignored) {
            ignoredPathCount += 1;
            continue;
          }
          if (depth >= limits.maxDepth) {
            limitReasons.add("depth");
            continue;
          }

          childDirectories.push({ absolutePath, depth, relativePath });
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const decision = await ignoreEvaluator.check({ kind: "file", path: relativePath });
        if (decision.ignored) {
          ignoredPathCount += 1;
          continue;
        }

        const metadata = await lstat(absolutePath);
        if (metadata.isSymbolicLink()) {
          skippedSymlinkCount += 1;
          continue;
        }
        if (!metadata.isFile()) {
          continue;
        }
        if (files.length >= limits.maxFiles) {
          limitReasons.add("file_count");
          hardLimitReached = true;
          break;
        }
        if (totalBytes + metadata.size > limits.maxTotalBytes) {
          limitReasons.add("total_bytes");
          hardLimitReached = true;
          break;
        }

        files.push({
          modifiedAt: metadata.mtime.toISOString(),
          path: relativePath,
          sizeBytes: metadata.size,
        });
        totalBytes += metadata.size;
      }

      for (let index = childDirectories.length - 1; index >= 0; index -= 1) {
        const child = childDirectories[index];
        if (child !== undefined) {
          directories.push(child);
        }
      }
    }

    return {
      files,
      ignoredPathCount,
      limitReasons: [...limitReasons],
      skippedSymlinkCount,
      totalBytes,
    };
  }
}

function compareNames(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
