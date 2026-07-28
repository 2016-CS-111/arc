import { posix } from "node:path";

import ts from "typescript";

import {
  PROJECT_MODULE_RESOLUTION_WARNING_CODES,
  type ProjectModuleResolutionWarning,
} from "../../domain/project-module-resolution.types.js";
import type { CatalogModuleResolutionHost } from "./catalog-module-resolution.host.js";

export interface TypeScriptProjectConfiguration {
  readonly cacheKey: string;
  readonly configRelativePath: string | null;
  readonly options: ts.CompilerOptions;
}

export class TypeScriptProjectConfigLoader {
  public readonly warnings: readonly ProjectModuleResolutionWarning[];

  private readonly configurations = new Map<string, TypeScriptProjectConfiguration>();
  private readonly configPaths: ReadonlySet<string>;
  private readonly fallbackConfiguration: TypeScriptProjectConfiguration = {
    cacheKey: "arc-default",
    configRelativePath: null,
    options: {
      allowJs: true,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      resolveJsonModule: true,
      resolvePackageJsonExports: true,
      resolvePackageJsonImports: true,
    },
  };

  public constructor(private readonly host: CatalogModuleResolutionHost) {
    const metadataFiles = host.getMetadataFiles();
    const configPaths = metadataFiles
      .map((file) => file.relativePath)
      .filter((relativePath) => isSelectableConfigPath(relativePath));
    this.configPaths = new Set(configPaths);

    const warnings = new Map<string, ProjectModuleResolutionWarning>();
    this.inspectConfigGraph(warnings);
    for (const configPath of configPaths) {
      this.configurations.set(configPath, this.loadConfiguration(configPath, warnings));
    }
    if (host.getCatalogFiles().some((file) => isJavaScriptOrTypeScript(file.relativePath))) {
      const hasUnconfiguredFile = host
        .getCatalogFiles()
        .some((file) => isJavaScriptOrTypeScript(file.relativePath) && this.findConfigPath(file.relativePath) === null);
      if (hasUnconfiguredFile) {
        addWarning(warnings, "config_missing", null);
      }
    }

    this.warnings = [...warnings.values()].sort(compareWarnings);
  }

  public getConfiguration(containingRelativePath: string): TypeScriptProjectConfiguration {
    const configPath = this.findConfigPath(containingRelativePath);
    return configPath === null
      ? this.fallbackConfiguration
      : (this.configurations.get(configPath) ?? this.fallbackConfiguration);
  }

  private findConfigPath(containingRelativePath: string): string | null {
    let directory = posix.dirname(containingRelativePath);

    while (directory !== ".") {
      const prefix = `${directory}/`;
      const tsconfigPath = `${prefix}tsconfig.json`;
      if (this.configPaths.has(tsconfigPath)) {
        return tsconfigPath;
      }
      const jsconfigPath = `${prefix}jsconfig.json`;
      if (this.configPaths.has(jsconfigPath)) {
        return jsconfigPath;
      }
      directory = posix.dirname(directory);
    }
    if (this.configPaths.has("tsconfig.json")) {
      return "tsconfig.json";
    }
    return this.configPaths.has("jsconfig.json") ? "jsconfig.json" : null;
  }

  private inspectConfigGraph(warnings: Map<string, ProjectModuleResolutionWarning>): void {
    const configMetadata = this.host.getMetadataFiles().filter((file) => isConfigMetadataPath(file.relativePath));
    const metadataPaths = new Set(configMetadata.map((file) => file.relativePath));
    const graph = new Map<string, string[]>();

    for (const configFile of configMetadata) {
      const absolutePath = this.host.toAbsolutePath(configFile.relativePath);
      if (absolutePath === null) {
        continue;
      }
      const parsed = ts.parseConfigFileTextToJson(absolutePath, configFile.content);
      if (parsed.error !== undefined || !isRecord(parsed.config)) {
        addWarning(warnings, "config_invalid", configFile.relativePath);
        continue;
      }

      const targets: string[] = [];
      for (const extendedPath of readExtendsValues(parsed.config)) {
        const resolved = resolveExtendedConfigPath(configFile.relativePath, extendedPath, metadataPaths);
        if (resolved.status === "outside") {
          addWarning(warnings, "config_extends_outside_project", configFile.relativePath);
        } else if (resolved.status === "missing") {
          addWarning(warnings, "config_extends_missing", configFile.relativePath);
        } else {
          targets.push(resolved.relativePath);
        }
      }
      graph.set(configFile.relativePath, targets);
    }

    this.findConfigCycles(graph, warnings);
  }

  private findConfigCycles(
    graph: ReadonlyMap<string, readonly string[]>,
    warnings: Map<string, ProjectModuleResolutionWarning>,
  ): void {
    const visited = new Set<string>();
    const active = new Set<string>();

    const visit = (configPath: string): void => {
      if (active.has(configPath)) {
        addWarning(warnings, "config_extends_cycle", configPath);
        return;
      }
      if (visited.has(configPath)) {
        return;
      }

      active.add(configPath);
      for (const targetPath of graph.get(configPath) ?? []) {
        visit(targetPath);
      }
      active.delete(configPath);
      visited.add(configPath);
    };

    for (const configPath of graph.keys()) {
      visit(configPath);
    }
  }

  private loadConfiguration(
    configRelativePath: string,
    warnings: Map<string, ProjectModuleResolutionWarning>,
  ): TypeScriptProjectConfiguration {
    const configPath = this.host.toAbsolutePath(configRelativePath);
    if (configPath === null) {
      addWarning(warnings, "config_invalid", configRelativePath);
      return this.fallbackConfiguration;
    }

    const diagnostics: ts.Diagnostic[] = [];
    const deniedPathCount = this.host.getDeniedPathCount();

    try {
      const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
        directoryExists: (directoryName) => this.host.directoryExists(directoryName),
        fileExists: (fileName) => this.host.fileExists(fileName),
        getCurrentDirectory: () => this.host.getCurrentDirectory(),
        getDirectories: (directoryName) => this.host.getDirectories(directoryName),
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          diagnostics.push(diagnostic);
        },
        readDirectory: (rootDir, extensions, excludes, includes, depth) =>
          this.host.readDirectory(rootDir, extensions, excludes, includes, depth),
        readFile: (fileName) => this.host.readFile(fileName),
        realpath: (candidatePath) => this.host.realpath(candidatePath),
        useCaseSensitiveFileNames: this.host.useCaseSensitiveFileNames,
      });

      if (parsed === undefined) {
        addWarning(warnings, "config_invalid", configRelativePath);
        return this.fallbackConfiguration;
      }
      diagnostics.push(...parsed.errors);
      if (diagnostics.some((diagnostic) => diagnostic.code !== 18002 && diagnostic.code !== 18003)) {
        addWarning(warnings, "config_invalid", configRelativePath);
      }
      if (this.host.getDeniedPathCount() > deniedPathCount) {
        addWarning(warnings, "config_extends_outside_project", configRelativePath);
      }

      return {
        cacheKey: configRelativePath,
        configRelativePath,
        options: parsed.options,
      };
    } catch {
      addWarning(warnings, "config_invalid", configRelativePath);
      return this.fallbackConfiguration;
    }
  }
}

type ExtendedConfigResolution =
  | { readonly status: "found"; readonly relativePath: string }
  | { readonly status: "missing" }
  | { readonly status: "outside" };

function resolveExtendedConfigPath(
  containingConfigPath: string,
  extendedPath: string,
  metadataPaths: ReadonlySet<string>,
): ExtendedConfigResolution {
  if (
    extendedPath.length === 0 ||
    extendedPath.includes("\0") ||
    extendedPath.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/u.test(extendedPath)
  ) {
    return { status: "outside" };
  }
  if (!extendedPath.startsWith(".")) {
    return { status: "missing" };
  }

  const joinedPath = posix.normalize(posix.join(posix.dirname(containingConfigPath), extendedPath));
  if (joinedPath === ".." || joinedPath.startsWith("../")) {
    return { status: "outside" };
  }

  const candidates = joinedPath.endsWith(".json")
    ? [joinedPath]
    : [joinedPath, `${joinedPath}.json`, `${joinedPath}/tsconfig.json`];
  const match = candidates.find((candidate) => metadataPaths.has(candidate));
  return match === undefined ? { status: "missing" } : { relativePath: match, status: "found" };
}

function readExtendsValues(config: Readonly<Record<string, unknown>>): readonly string[] {
  const value = config.extends;
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function addWarning(
  warnings: Map<string, ProjectModuleResolutionWarning>,
  code: ProjectModuleResolutionWarning["code"],
  relativePath: string | null,
): void {
  warnings.set(`${code}:${relativePath ?? ""}`, { code, relativePath });
}

function compareWarnings(left: ProjectModuleResolutionWarning, right: ProjectModuleResolutionWarning): number {
  return (
    PROJECT_MODULE_RESOLUTION_WARNING_CODES.indexOf(left.code) -
      PROJECT_MODULE_RESOLUTION_WARNING_CODES.indexOf(right.code) ||
    (left.relativePath ?? "").localeCompare(right.relativePath ?? "")
  );
}

function isConfigMetadataPath(relativePath: string): boolean {
  const basename = posix.basename(relativePath);
  return (basename.startsWith("tsconfig") || basename.startsWith("jsconfig")) && basename.endsWith(".json");
}

function isSelectableConfigPath(relativePath: string): boolean {
  const basename = posix.basename(relativePath);
  return basename === "tsconfig.json" || basename === "jsconfig.json";
}

function isJavaScriptOrTypeScript(relativePath: string): boolean {
  return /\.(?:c|m)?(?:j|t)sx?$/u.test(relativePath);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
