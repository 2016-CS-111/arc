import { createHash } from "node:crypto";
import { isBuiltin } from "node:module";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

import ts from "typescript";

import type {
  PreparedProjectModuleResolver,
  ProjectModuleResolver,
} from "../../application/project-module.resolver.js";
import {
  PROJECT_MODULE_RESOLUTION_WARNING_CODES,
  type PrepareProjectModuleResolverInput,
  type ProjectModuleResolution,
  type ProjectModuleResolutionWarning,
  type ResolveProjectModuleInput,
} from "../../domain/project-module-resolution.types.js";
import { CatalogModuleResolutionHost } from "./catalog-module-resolution.host.js";
import {
  TypeScriptProjectConfigLoader,
  type TypeScriptProjectConfiguration,
} from "./typescript-project-config.loader.js";

export const TYPESCRIPT_MODULE_RESOLVER_VERSION = "5.9.3";
const resolverSchemaVersion = "arc-module-resolver@1";
const windowsAbsolutePath = /^[a-zA-Z]:[\\/]/u;
const urlScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/u;

interface PackageScope {
  readonly directory: string;
  readonly importPatterns: readonly string[];
  readonly name: string | null;
}

export class TypeScriptProjectModuleResolver implements ProjectModuleResolver {
  public prepare(input: PrepareProjectModuleResolverInput): PreparedProjectModuleResolver {
    if (ts.version !== TYPESCRIPT_MODULE_RESOLVER_VERSION) {
      throw new Error(
        `Unsupported TypeScript module resolver version ${ts.version}; expected ${TYPESCRIPT_MODULE_RESOLVER_VERSION}.`,
      );
    }

    const host = new CatalogModuleResolutionHost(input);
    const configLoader = new TypeScriptProjectConfigLoader(host);
    const packageMetadata = this.readPackageScopes(host);
    const warnings = mergeWarnings(configLoader.warnings, packageMetadata.warnings);
    const resolverIdentity = `typescript@${ts.version}/${resolverSchemaVersion}`;

    return new TypeScriptProjectModuleResolutionContext(
      host,
      configLoader,
      packageMetadata.scopes,
      warnings,
      resolverIdentity,
      createResolutionContextHash(host, resolverIdentity),
    );
  }

  private readPackageScopes(host: CatalogModuleResolutionHost): {
    readonly scopes: readonly PackageScope[];
    readonly warnings: readonly ProjectModuleResolutionWarning[];
  } {
    const scopes: PackageScope[] = [];
    const warnings: ProjectModuleResolutionWarning[] = [];

    for (const metadataFile of host.getMetadataFiles()) {
      if (posix.basename(metadataFile.relativePath) !== "package.json") {
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(metadataFile.content);
        if (!isRecord(parsed)) {
          throw new TypeError("Package metadata must be an object.");
        }
        scopes.push({
          directory: posix.dirname(metadataFile.relativePath),
          importPatterns: readPackageImportPatterns(parsed),
          name: typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : null,
        });
      } catch {
        warnings.push({
          code: "package_metadata_invalid",
          relativePath: metadataFile.relativePath,
        });
      }
    }

    return {
      scopes: scopes.sort((left, right) => right.directory.length - left.directory.length),
      warnings,
    };
  }
}

class TypeScriptProjectModuleResolutionContext implements PreparedProjectModuleResolver {
  private readonly caches = new Map<string, ts.ModuleResolutionCache>();

  public constructor(
    private readonly host: CatalogModuleResolutionHost,
    private readonly configLoader: TypeScriptProjectConfigLoader,
    private readonly packageScopes: readonly PackageScope[],
    public readonly warnings: readonly ProjectModuleResolutionWarning[],
    public readonly resolverIdentity: string,
    public readonly resolutionContextHash: string,
  ) {}

  public resolve(input: ResolveProjectModuleInput): ProjectModuleResolution {
    const containingFile = this.host.getCatalogFileByRelativePath(input.containingRelativePath);
    const containingPath = this.host.toAbsolutePath(input.containingRelativePath);
    if (containingFile === null || containingPath === null) {
      return unresolved("not_in_source_catalog");
    }

    const earlyResult = this.validateSpecifier(input.specifier, containingPath);
    if (earlyResult !== null) {
      return earlyResult;
    }

    const configuration = this.configLoader.getConfiguration(containingFile.relativePath);
    try {
      const result = ts.resolveModuleName(
        input.specifier,
        containingPath,
        configuration.options,
        this.host,
        this.getCache(configuration),
        undefined,
        input.mode === "import" ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
      ).resolvedModule;

      if (result !== undefined) {
        const target = this.host.getCatalogFileByAbsolutePath(result.resolvedFileName);
        if (target !== null) {
          return {
            kind: "local",
            targetRelativePath: target.relativePath,
            targetSourceFileId: target.sourceFileId,
          };
        }
        return this.host.isWithinProject(result.resolvedFileName)
          ? unresolved("not_in_source_catalog")
          : unresolved("outside_project");
      }
    } catch {
      return unresolved("unsupported_resolution");
    }

    if (isRelativeSpecifier(input.specifier) || input.specifier.startsWith("#")) {
      return unresolved("not_found");
    }
    if (this.isClaimedProjectSpecifier(input.specifier, containingFile.relativePath, configuration)) {
      return unresolved("not_found");
    }

    const packageName = normalizeExternalPackageName(input.specifier);
    return packageName === null ? unresolved("invalid_specifier") : { kind: "external", packageName };
  }

  private getCache(configuration: TypeScriptProjectConfiguration): ts.ModuleResolutionCache {
    const cached = this.caches.get(configuration.cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const cache = ts.createModuleResolutionCache(this.host.rootPath, (fileName) => fileName, configuration.options);
    this.caches.set(configuration.cacheKey, cache);
    return cache;
  }

  private isClaimedProjectSpecifier(
    specifier: string,
    containingRelativePath: string,
    configuration: TypeScriptProjectConfiguration,
  ): boolean {
    if (Object.keys(configuration.options.paths ?? {}).some((pattern) => matchesPattern(pattern, specifier))) {
      return true;
    }

    const packageScope = this.findPackageScope(containingRelativePath);
    if (packageScope === null) {
      return false;
    }
    if (
      packageScope.name !== null &&
      (specifier === packageScope.name || specifier.startsWith(`${packageScope.name}/`))
    ) {
      return true;
    }
    return (
      specifier.startsWith("#") && packageScope.importPatterns.some((pattern) => matchesPattern(pattern, specifier))
    );
  }

  private findPackageScope(containingRelativePath: string): PackageScope | null {
    const containingDirectory = posix.dirname(containingRelativePath);
    return (
      this.packageScopes.find(
        (scope) =>
          scope.directory === "." ||
          containingDirectory === scope.directory ||
          containingDirectory.startsWith(`${scope.directory}/`),
      ) ?? null
    );
  }

  private validateSpecifier(specifier: string, containingPath: string): ProjectModuleResolution | null {
    if (specifier.length === 0 || specifier.includes("\0")) {
      return unresolved("invalid_specifier");
    }
    if (isBuiltin(specifier)) {
      return {
        builtinName: specifier.startsWith("node:") ? specifier : `node:${specifier}`,
        kind: "builtin",
      };
    }
    if (specifier.startsWith("/") || specifier.startsWith("\\\\") || windowsAbsolutePath.test(specifier)) {
      return unresolved("outside_project");
    }
    if (specifier.includes("\\")) {
      return unresolved("invalid_specifier");
    }
    if (urlScheme.test(specifier)) {
      return unresolved("unsupported_scheme");
    }
    if (specifier === "#" || specifier.startsWith("#/")) {
      return unresolved("invalid_specifier");
    }

    if (isRelativeSpecifier(specifier)) {
      const unresolvedTarget = resolve(dirname(containingPath), specifier);
      if (!isPathWithinRoot(this.host.rootPath, unresolvedTarget)) {
        return unresolved("outside_project");
      }
    }
    return null;
  }
}

function createResolutionContextHash(host: CatalogModuleResolutionHost, resolverIdentity: string): string {
  const hash = createHash("sha256").update(resolverIdentity);

  for (const file of host.getCatalogFiles()) {
    hash.update("\0file\0").update(file.relativePath).update("\0").update(file.sourceFileId);
  }
  for (const metadataFile of host.getMetadataFiles()) {
    hash.update("\0metadata\0").update(metadataFile.relativePath).update("\0").update(metadataFile.contentHash);
  }
  return hash.digest("hex");
}

function mergeWarnings(
  ...warningGroups: readonly (readonly ProjectModuleResolutionWarning[])[]
): readonly ProjectModuleResolutionWarning[] {
  const warnings = new Map<string, ProjectModuleResolutionWarning>();
  for (const warning of warningGroups.flat()) {
    warnings.set(`${warning.code}:${warning.relativePath ?? ""}`, warning);
  }
  return [...warnings.values()].sort(
    (left, right) =>
      PROJECT_MODULE_RESOLUTION_WARNING_CODES.indexOf(left.code) -
        PROJECT_MODULE_RESOLUTION_WARNING_CODES.indexOf(right.code) ||
      (left.relativePath ?? "").localeCompare(right.relativePath ?? ""),
  );
}

function readPackageImportPatterns(packageMetadata: Readonly<Record<string, unknown>>): readonly string[] {
  return isRecord(packageMetadata.imports) ? Object.keys(packageMetadata.imports).sort() : [];
}

function normalizeExternalPackageName(specifier: string): string | null {
  const segments = specifier.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    return null;
  }
  if (specifier.startsWith("@")) {
    const scope = segments[0];
    const packageSegment = segments[1];
    return scope !== undefined &&
      packageSegment !== undefined &&
      /^@[a-zA-Z\d._~-]+$/u.test(scope) &&
      isPackageSegment(packageSegment)
      ? `${scope}/${packageSegment}`
      : null;
  }

  const packageSegment = segments[0];
  return packageSegment !== undefined && isPackageSegment(packageSegment) ? packageSegment : null;
}

function isPackageSegment(segment: string): boolean {
  return /^[a-zA-Z\d._~-]+$/u.test(segment) && segment !== "." && segment !== "..";
}

function matchesPattern(pattern: string, specifier: string): boolean {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex < 0) {
    return pattern === specifier;
  }
  return specifier.startsWith(pattern.slice(0, wildcardIndex)) && specifier.endsWith(pattern.slice(wildcardIndex + 1));
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../");
}

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

function unresolved(
  reason: Extract<ProjectModuleResolution, { kind: "unresolved" }>["reason"],
): ProjectModuleResolution {
  return { kind: "unresolved", reason };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
