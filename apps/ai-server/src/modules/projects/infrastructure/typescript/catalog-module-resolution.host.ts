import { createHash } from "node:crypto";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { posix } from "node:path";

import type ts from "typescript";

import type {
  PrepareProjectModuleResolverInput,
  ProjectModuleCatalogFile,
  ProjectModuleMetadataFile,
} from "../../domain/project-module-resolution.types.js";

const windowsAbsolutePath = /^[a-zA-Z]:\//u;

export class CatalogModuleResolutionHost implements ts.ParseConfigHost {
  public readonly rootPath: string;
  public readonly useCaseSensitiveFileNames = true;

  private deniedPathCount = 0;
  private readonly directories = new Set<string>();
  private readonly filesByAbsolutePath = new Map<string, ProjectModuleCatalogFile>();
  private readonly filesByRelativePath = new Map<string, ProjectModuleCatalogFile>();
  private readonly metadataByAbsolutePath = new Map<string, ProjectModuleMetadataFile>();
  private readonly metadataByRelativePath = new Map<string, ProjectModuleMetadataFile>();
  private readonly sourceFileIds = new Set<string>();

  public constructor(input: PrepareProjectModuleResolverInput) {
    this.validateRootPath(input.rootPath);
    this.validateMetadataLimit(input.maxMetadataBytes);
    this.rootPath = normalize(input.rootPath);
    this.directories.add(this.rootPath);

    for (const file of input.files) {
      this.addCatalogFile(file);
    }
    for (const metadataFile of input.metadataFiles) {
      this.addMetadataFile(metadataFile, input.maxMetadataBytes);
    }
  }

  public directoryExists(directoryName: string): boolean {
    const candidatePath = this.resolveHostPath(directoryName);
    return candidatePath !== null && this.directories.has(candidatePath);
  }

  public fileExists(fileName: string): boolean {
    const candidatePath = this.resolveHostPath(fileName);
    return candidatePath !== null && this.filesByAbsolutePath.has(candidatePath);
  }

  public getCatalogFileByAbsolutePath(fileName: string): ProjectModuleCatalogFile | null {
    const candidatePath = this.resolveHostPath(fileName);
    return candidatePath === null ? null : (this.filesByAbsolutePath.get(candidatePath) ?? null);
  }

  public getCatalogFileByRelativePath(relativePath: string): ProjectModuleCatalogFile | null {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    return normalizedPath === null ? null : (this.filesByRelativePath.get(normalizedPath) ?? null);
  }

  public getCatalogFiles(): readonly ProjectModuleCatalogFile[] {
    return [...this.filesByRelativePath.values()].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
  }

  public getCurrentDirectory(): string {
    return this.rootPath;
  }

  public getDeniedPathCount(): number {
    return this.deniedPathCount;
  }

  public getDirectories(directoryName: string): string[] {
    const parentPath = this.resolveHostPath(directoryName);
    if (parentPath === null || !this.directories.has(parentPath)) {
      return [];
    }

    return [...this.directories]
      .filter((candidatePath) => candidatePath !== parentPath && dirname(candidatePath) === parentPath)
      .sort();
  }

  public getMetadataFiles(): readonly ProjectModuleMetadataFile[] {
    return [...this.metadataByRelativePath.values()].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
  }

  public isWithinProject(candidatePath: string): boolean {
    return this.resolveHostPath(candidatePath, false) !== null;
  }

  public normalizeRelativePath(input: string): string | null {
    if (input.length === 0 || input.includes("\0")) {
      return null;
    }

    const portablePath = input.replaceAll("\\", "/");
    if (portablePath.startsWith("/") || windowsAbsolutePath.test(portablePath)) {
      return null;
    }

    const segments = portablePath.split("/").filter((segment) => segment !== "" && segment !== ".");
    if (segments.length === 0 || segments.includes("..")) {
      return null;
    }
    return segments.join("/");
  }

  public readDirectory(
    rootDir: string,
    extensions: readonly string[],
    _excludes: readonly string[] | undefined,
    _includes: readonly string[],
    depth?: number,
  ): string[] {
    const rootPath = this.resolveHostPath(rootDir);
    if (rootPath === null || !this.directories.has(rootPath)) {
      return [];
    }

    return [...this.filesByAbsolutePath.keys()]
      .filter((fileName) => {
        const relativePath = relative(rootPath, fileName);
        if (
          relativePath === "" ||
          relativePath === ".." ||
          relativePath.startsWith(`..${sep}`) ||
          isAbsolute(relativePath)
        ) {
          return false;
        }
        if (depth !== undefined && relativePath.split(sep).length - 1 > depth) {
          return false;
        }
        return extensions.length === 0 || extensions.some((extension) => fileName.endsWith(extension));
      })
      .sort();
  }

  public readFile(fileName: string): string | undefined {
    const candidatePath = this.resolveHostPath(fileName);
    return candidatePath === null ? undefined : this.metadataByAbsolutePath.get(candidatePath)?.content;
  }

  public realpath(candidatePath: string): string {
    const resolvedPath = this.resolveHostPath(candidatePath);
    if (resolvedPath === null || (!this.filesByAbsolutePath.has(resolvedPath) && !this.directories.has(resolvedPath))) {
      return "";
    }
    return resolvedPath;
  }

  public toAbsolutePath(relativePath: string): string | null {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    return normalizedPath === null ? null : resolve(this.rootPath, ...normalizedPath.split("/"));
  }

  public toRelativePath(absolutePath: string): string | null {
    const resolvedPath = this.resolveHostPath(absolutePath);
    if (resolvedPath === null) {
      return null;
    }
    const relativePath = relative(this.rootPath, resolvedPath).split(sep).join("/");
    return relativePath === "" ? null : relativePath;
  }

  private addCatalogFile(file: ProjectModuleCatalogFile): void {
    const relativePath = this.normalizeRelativePath(file.relativePath);
    if (relativePath === null || file.sourceFileId.length === 0 || file.sourceFileId.includes("\0")) {
      throw new RangeError("Module-resolution catalog files require a safe path and source-file ID.");
    }
    if (this.filesByRelativePath.has(relativePath) || this.sourceFileIds.has(file.sourceFileId)) {
      throw new RangeError(`Duplicate module-resolution catalog path or source-file ID: ${relativePath}`);
    }

    const normalizedFile = { ...file, relativePath };
    const absolutePath = resolve(this.rootPath, ...relativePath.split("/"));
    this.filesByRelativePath.set(relativePath, normalizedFile);
    this.filesByAbsolutePath.set(absolutePath, normalizedFile);
    this.sourceFileIds.add(file.sourceFileId);
    this.addParentDirectories(absolutePath);
  }

  private addMetadataFile(file: ProjectModuleMetadataFile, maxMetadataBytes: number): void {
    const relativePath = this.normalizeRelativePath(file.relativePath);
    if (
      relativePath === null ||
      !this.isAllowedMetadataPath(relativePath) ||
      !this.filesByRelativePath.has(relativePath)
    ) {
      throw new RangeError("Resolver metadata must reference an allowed current catalog file.");
    }
    if (this.metadataByRelativePath.has(relativePath)) {
      throw new RangeError(`Duplicate module-resolution metadata path: ${relativePath}`);
    }
    if (Buffer.byteLength(file.content, "utf8") > maxMetadataBytes) {
      throw new RangeError(`Module-resolution metadata exceeds the configured limit: ${relativePath}`);
    }

    const observedHash = createHash("sha256").update(file.content, "utf8").digest("hex");
    if (observedHash !== file.contentHash) {
      throw new RangeError(`Module-resolution metadata hash mismatch: ${relativePath}`);
    }

    const normalizedFile = { ...file, relativePath };
    const absolutePath = resolve(this.rootPath, ...relativePath.split("/"));
    this.metadataByRelativePath.set(relativePath, normalizedFile);
    this.metadataByAbsolutePath.set(absolutePath, normalizedFile);
  }

  private addParentDirectories(fileName: string): void {
    let currentPath = dirname(fileName);
    while (this.isWithinProject(currentPath)) {
      this.directories.add(currentPath);
      if (currentPath === this.rootPath) {
        return;
      }
      currentPath = dirname(currentPath);
    }
  }

  private isAllowedMetadataPath(relativePath: string): boolean {
    const basename = posix.basename(relativePath);
    return (
      basename === "package.json" ||
      ((basename.startsWith("tsconfig") || basename.startsWith("jsconfig")) && basename.endsWith(".json"))
    );
  }

  private resolveHostPath(candidatePath: string, recordDenied = true): string | null {
    if (candidatePath.includes("\0")) {
      if (recordDenied) {
        this.deniedPathCount += 1;
      }
      return null;
    }

    const resolvedPath = normalize(isAbsolute(candidatePath) ? candidatePath : resolve(this.rootPath, candidatePath));
    const relativePath = relative(this.rootPath, resolvedPath);
    const isWithinRoot =
      relativePath === "" ||
      (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
    if (!isWithinRoot && recordDenied) {
      this.deniedPathCount += 1;
    }
    return isWithinRoot ? resolvedPath : null;
  }

  private validateMetadataLimit(limit: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("Module-resolution metadata limit must be a positive integer.");
    }
  }

  private validateRootPath(rootPath: string): void {
    if (!isAbsolute(rootPath) || rootPath.includes("\0")) {
      throw new RangeError("Module-resolution root must be an absolute path.");
    }
  }
}
