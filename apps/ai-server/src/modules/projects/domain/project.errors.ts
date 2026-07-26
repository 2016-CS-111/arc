export class InvalidProjectRootError extends Error {
  public constructor() {
    super("Project root must be an existing local directory.");
    this.name = "InvalidProjectRootError";
  }
}
