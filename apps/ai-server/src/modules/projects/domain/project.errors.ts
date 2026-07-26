export class InvalidProjectRootError extends Error {
  public constructor() {
    super("Project root must be an existing local directory.");
    this.name = "InvalidProjectRootError";
  }
}

export class InvalidProjectPathError extends Error {
  public constructor() {
    super("Project path must remain relative to the registered workspace.");
    this.name = "InvalidProjectPathError";
  }
}

export class ProjectNotFoundError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} was not found.`);
    this.name = "ProjectNotFoundError";
  }
}

export class IgnoreRulesFileTooLargeError extends Error {
  public constructor(relativePath: string) {
    super(`Ignore rules file ${relativePath} exceeds the 1 MiB limit.`);
    this.name = "IgnoreRulesFileTooLargeError";
  }
}

export class ProjectScanAlreadyRunningError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} already has a running inventory scan.`);
    this.name = "ProjectScanAlreadyRunningError";
  }
}

export class ProjectScanFailedError extends Error {
  public constructor() {
    super("Arc could not complete the project inventory scan.");
    this.name = "ProjectScanFailedError";
  }
}
