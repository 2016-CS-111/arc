import { Injectable } from "@nestjs/common";

import { InvalidProjectPathError } from "../domain/project.errors.js";

const windowsAbsolutePath = /^[a-zA-Z]:\//;

@Injectable()
export class ProjectPathNormalizer {
  public normalize(input: string): string {
    if (input.includes("\0")) {
      throw new InvalidProjectPathError();
    }

    const portablePath = input.replaceAll("\\", "/");
    if (portablePath.startsWith("/") || windowsAbsolutePath.test(portablePath)) {
      throw new InvalidProjectPathError();
    }

    const segments = portablePath.split("/").filter((segment) => segment !== "" && segment !== ".");
    if (segments.length === 0 || segments.includes("..")) {
      throw new InvalidProjectPathError();
    }

    return segments.join("/");
  }
}
