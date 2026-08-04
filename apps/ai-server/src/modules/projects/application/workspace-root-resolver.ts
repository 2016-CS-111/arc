export interface WorkspaceRootResolver {
  resolveDirectory(rootPath: string): Promise<string>;
}
