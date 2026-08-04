import { lstat, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { IgnoreRulesFileReader } from "../application/ignore-rules-file.reader.js";
import { IgnoreRulesFileTooLargeError, InvalidProjectPathError } from "../domain/project.errors.js";

const maximumIgnoreFileBytes = 1024 * 1024;

export class NodeIgnoreRulesFileReader implements IgnoreRulesFileReader {
  public async read(rootPath: string, relativePath: string): Promise<string | null> {
    const filePath = resolve(rootPath, relativePath);
    const pathFromRoot = relative(rootPath, filePath);
    if (pathFromRoot.startsWith("..") || pathFromRoot === "") {
      throw new InvalidProjectPathError();
    }

    try {
      const metadata = await lstat(filePath);
      if (!metadata.isFile()) {
        return null;
      }
      if (metadata.size > maximumIgnoreFileBytes) {
        throw new IgnoreRulesFileTooLargeError(relativePath);
      }

      return await readFile(filePath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
