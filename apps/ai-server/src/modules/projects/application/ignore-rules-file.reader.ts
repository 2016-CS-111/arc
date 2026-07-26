export interface IgnoreRulesFileReader {
  read(rootPath: string, relativePath: string): Promise<string | null>;
}
