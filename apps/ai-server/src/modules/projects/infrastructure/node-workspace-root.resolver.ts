import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import type { WorkspaceRootResolver } from "../application/workspace-root-resolver.js";
import { InvalidProjectRootError } from "../domain/project.errors.js";

export class NodeWorkspaceRootResolver implements WorkspaceRootResolver {
  public async resolveDirectory(rootPath: string): Promise<string> {
    if (!isAbsolute(rootPath)) {
      throw new InvalidProjectRootError();
    }

    try {
      const canonicalPath = await realpath(rootPath);
      const metadata = await stat(canonicalPath);
      if (!metadata.isDirectory()) {
        throw new InvalidProjectRootError();
      }

      return canonicalPath;
    } catch (error) {
      if (error instanceof InvalidProjectRootError) {
        throw error;
      }

      throw new InvalidProjectRootError();
    }
  }
}
