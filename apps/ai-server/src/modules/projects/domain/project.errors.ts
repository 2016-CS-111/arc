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

export class ProjectInventoryRequiredError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} requires a completed inventory scan before source indexing.`);
    this.name = "ProjectInventoryRequiredError";
  }
}

export class ProjectSourceIndexAlreadyRunningError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} already has a running source index.`);
    this.name = "ProjectSourceIndexAlreadyRunningError";
  }
}

export class ProjectSourceIndexFailedError extends Error {
  public constructor() {
    super("Arc could not complete the project source index.");
    this.name = "ProjectSourceIndexFailedError";
  }
}

export class ProjectSourceCatalogRequiredError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} requires a completed source index before source intelligence indexing.`);
    this.name = "ProjectSourceCatalogRequiredError";
  }
}

export class ProjectSourceCatalogStaleError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} requires a fresh source index before source intelligence indexing.`);
    this.name = "ProjectSourceCatalogStaleError";
  }
}

export class ProjectSymbolIndexAlreadyRunningError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} already has a running symbol index.`);
    this.name = "ProjectSymbolIndexAlreadyRunningError";
  }
}

export class ProjectSymbolIndexFailedError extends Error {
  public constructor() {
    super("Arc could not complete the project symbol index.");
    this.name = "ProjectSymbolIndexFailedError";
  }
}

export class ProjectDependencyIndexAlreadyRunningError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} already has a running dependency index.`);
    this.name = "ProjectDependencyIndexAlreadyRunningError";
  }
}

export class ProjectDependencyIndexFailedError extends Error {
  public constructor() {
    super("Arc could not complete the project dependency index.");
    this.name = "ProjectDependencyIndexFailedError";
  }
}

export class ProjectDependencyCatalogRequiredError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} requires a dependency index before graph traversal.`);
    this.name = "ProjectDependencyCatalogRequiredError";
  }
}

export class ProjectDependencyCatalogStaleError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} requires a fresh dependency index before graph traversal.`);
    this.name = "ProjectDependencyCatalogStaleError";
  }
}

export class ProjectDependencyPathNotFoundError extends Error {
  public constructor(relativePath: string) {
    super(`Arc dependency graph does not contain ${relativePath}.`);
    this.name = "ProjectDependencyPathNotFoundError";
  }
}

export class ProjectDependencyGraphFailedError extends Error {
  public constructor() {
    super("Arc could not read the project dependency graph.");
    this.name = "ProjectDependencyGraphFailedError";
  }
}

export class ProjectFrameworkUpstreamCatalogRequiredError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} requires coherent source, symbol, and dependency catalogs.`);
    this.name = "ProjectFrameworkUpstreamCatalogRequiredError";
  }
}

export class ProjectFrameworkUpstreamCatalogStaleError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} requires fresh source, symbol, and dependency catalogs.`);
    this.name = "ProjectFrameworkUpstreamCatalogStaleError";
  }
}

export class ProjectFrameworkIndexAlreadyRunningError extends Error {
  public constructor(projectId: string) {
    super(`Arc project ${projectId} already has a running framework index.`);
    this.name = "ProjectFrameworkIndexAlreadyRunningError";
  }
}

export class ProjectFrameworkIndexFailedError extends Error {
  public constructor() {
    super("Arc could not complete the project framework index.");
    this.name = "ProjectFrameworkIndexFailedError";
  }
}
