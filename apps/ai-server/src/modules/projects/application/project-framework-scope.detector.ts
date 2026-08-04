import { createHash } from "node:crypto";
import { posix } from "node:path";

import type {
  DetectProjectFrameworkScopesInput,
  ProjectFrameworkDependency,
  ProjectFrameworkFileScope,
  ProjectFrameworkKind,
  ProjectFrameworkPackageMetadata,
  ProjectFrameworkScope,
  ProjectFrameworkScopeDetectionResult,
  ProjectFrameworkScopeEvidence,
  ProjectFrameworkScopeWarning,
  ProjectFrameworkSourceFile,
} from "../domain/project-framework.types.js";
import { frameworksForPackage } from "./project-framework-import.resolver.js";

const dependencySections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

interface PackageScope {
  readonly contentHash: string;
  readonly frameworks: Set<ProjectFrameworkKind>;
  readonly packageName: string | null;
  readonly relativePath: string;
  readonly rootPath: string;
  readonly sourceFileId: string;
}

interface ScopeAccumulator {
  readonly evidence: ProjectFrameworkScopeEvidence[];
  readonly framework: ProjectFrameworkKind;
  readonly packageContentHash: string | null;
  readonly packageName: string | null;
  readonly rootPath: string;
}

export class ProjectFrameworkScopeDetector {
  public detect(input: DetectProjectFrameworkScopesInput): ProjectFrameworkScopeDetectionResult {
    validateInput(input);
    const warnings: ProjectFrameworkScopeWarning[] = [];
    const packageScopes = input.packageMetadata
      .map((metadata) => this.parsePackage(metadata, warnings))
      .filter((scope): scope is PackageScope => scope !== null)
      .sort(comparePackageScopes);
    const accumulators = new Map<string, ScopeAccumulator>();

    for (const packageScope of packageScopes) {
      for (const framework of packageScope.frameworks) {
        this.addEvidence(accumulators, framework, packageScope, {
          dependencyEdgeId: null,
          kind: "package_metadata",
          relativePath: packageScope.relativePath,
          sourceFileId: packageScope.sourceFileId,
        });
      }
    }

    for (const dependency of input.dependencies) {
      if (dependency.externalPackage === null || dependency.typeOnly) {
        continue;
      }
      const packageScope = nearestPackageScope(dependency.sourceRelativePath, packageScopes);
      for (const framework of frameworksForPackage(dependency.externalPackage)) {
        this.addEvidence(accumulators, framework, packageScope ?? fallbackPackageScope(dependency), {
          dependencyEdgeId: dependency.id,
          kind: "import_binding",
          relativePath: dependency.sourceRelativePath,
          sourceFileId: dependency.sourceFileId,
        });
      }
    }

    const scopes = [...accumulators.values()]
      .map((scope) => toFrameworkScope(input.projectId, scope))
      .sort(compareScopes);
    return {
      fileScopes: input.sourceFiles.map((file) => toFileScope(file, scopes, packageScopes)).sort(compareFileScopes),
      scopes,
      warnings: warnings.sort((left, right) => compareText(left.relativePath, right.relativePath)),
    };
  }

  private parsePackage(
    metadata: ProjectFrameworkPackageMetadata,
    warnings: ProjectFrameworkScopeWarning[],
  ): PackageScope | null {
    try {
      const parsed: unknown = JSON.parse(metadata.content);
      if (!isRecord(parsed)) {
        throw new TypeError("Package metadata must be an object.");
      }
      const frameworks = new Set<ProjectFrameworkKind>();
      for (const sectionName of dependencySections) {
        const section = parsed[sectionName];
        if (!isRecord(section)) {
          continue;
        }
        for (const packageName of Object.keys(section)) {
          for (const framework of frameworksForPackage(packageName)) {
            frameworks.add(framework);
          }
        }
      }
      const packageName = typeof parsed.name === "string" && parsed.name.trim() !== "" ? parsed.name.trim() : null;
      return {
        contentHash: metadata.contentHash,
        frameworks,
        packageName,
        relativePath: metadata.relativePath,
        rootPath: packageRoot(metadata.relativePath),
        sourceFileId: metadata.sourceFileId,
      };
    } catch {
      warnings.push({
        code: "package_metadata_invalid",
        relativePath: metadata.relativePath,
      });
      return null;
    }
  }

  private addEvidence(
    accumulators: Map<string, ScopeAccumulator>,
    framework: ProjectFrameworkKind,
    packageScope: PackageScope,
    evidence: ProjectFrameworkScopeEvidence,
  ): void {
    const key = `${packageScope.rootPath}\0${framework}`;
    const current = accumulators.get(key);
    if (current === undefined) {
      accumulators.set(key, {
        evidence: [evidence],
        framework,
        packageContentHash: packageScope.contentHash,
        packageName: packageScope.packageName,
        rootPath: packageScope.rootPath,
      });
      return;
    }
    if (
      !current.evidence.some(
        (candidate) =>
          candidate.kind === evidence.kind &&
          candidate.sourceFileId === evidence.sourceFileId &&
          candidate.dependencyEdgeId === evidence.dependencyEdgeId,
      )
    ) {
      current.evidence.push(evidence);
    }
  }
}

function toFrameworkScope(projectId: string, scope: ScopeAccumulator): ProjectFrameworkScope {
  const evidence = [...scope.evidence].sort(compareEvidence);
  const scopeKey = sha256([projectId, scope.rootPath, scope.framework]);
  return {
    contextHash: sha256([
      scopeKey,
      scope.packageContentHash ?? "",
      scope.packageName ?? "",
      ...evidence.flatMap((item) => [item.kind, item.relativePath, item.sourceFileId, item.dependencyEdgeId ?? ""]),
    ]),
    evidence,
    framework: scope.framework,
    packageName: scope.packageName,
    rootPath: scope.rootPath,
    scopeKey,
  };
}

function toFileScope(
  file: ProjectFrameworkSourceFile,
  scopes: readonly ProjectFrameworkScope[],
  packageScopes: readonly PackageScope[],
): ProjectFrameworkFileScope {
  const packageScope = nearestPackageScope(file.relativePath, packageScopes);
  const rootPath = packageScope?.rootPath ?? ".";
  const matching = scopes.filter((scope) => scope.rootPath === rootPath);
  return {
    frameworks: matching.map((scope) => scope.framework),
    rootPath,
    scopeKeys: matching.map((scope) => scope.scopeKey),
    sourceFileId: file.sourceFileId,
  };
}

function nearestPackageScope(relativePath: string, scopes: readonly PackageScope[]): PackageScope | null {
  return (
    scopes
      .filter((scope) => containsPath(scope.rootPath, relativePath))
      .sort((left, right) => right.rootPath.length - left.rootPath.length || comparePackageScopes(left, right))[0] ??
    null
  );
}

function fallbackPackageScope(dependency: ProjectFrameworkDependency): PackageScope {
  return {
    contentHash: "",
    frameworks: new Set(),
    packageName: null,
    relativePath: dependency.sourceRelativePath,
    rootPath: ".",
    sourceFileId: dependency.sourceFileId,
  };
}

function packageRoot(relativePath: string): string {
  const root = posix.dirname(relativePath);
  return root === "" ? "." : root;
}

function containsPath(rootPath: string, relativePath: string): boolean {
  return rootPath === "." || relativePath === rootPath || relativePath.startsWith(`${rootPath}/`);
}

function validateInput(input: DetectProjectFrameworkScopesInput): void {
  const sourcePathsById = new Map<string, string>();
  const sourcePaths = new Set<string>();
  for (const file of input.sourceFiles) {
    if (sourcePathsById.has(file.sourceFileId) || sourcePaths.has(file.relativePath)) {
      throw new Error("Framework scope detection requires unique source file IDs and paths.");
    }
    sourcePathsById.set(file.sourceFileId, file.relativePath);
    sourcePaths.add(file.relativePath);
  }
  for (const metadata of input.packageMetadata) {
    if (sourcePathsById.get(metadata.sourceFileId) !== metadata.relativePath) {
      throw new Error("Framework package metadata must belong to the current source catalog.");
    }
    if (
      !/^[0-9a-f]{64}$/u.test(metadata.contentHash) ||
      sha256Content(metadata.content) !== metadata.contentHash ||
      posix.basename(metadata.relativePath) !== "package.json"
    ) {
      throw new Error("Framework package metadata identity is invalid.");
    }
  }
  for (const dependency of input.dependencies) {
    if (sourcePathsById.get(dependency.sourceFileId) !== dependency.sourceRelativePath) {
      throw new Error("Framework dependency evidence must belong to the current source catalog.");
    }
  }
}

function comparePackageScopes(left: PackageScope, right: PackageScope): number {
  return compareText(left.rootPath, right.rootPath) || compareText(left.sourceFileId, right.sourceFileId);
}

function compareScopes(left: ProjectFrameworkScope, right: ProjectFrameworkScope): number {
  return (
    compareText(left.rootPath, right.rootPath) ||
    compareText(left.framework, right.framework) ||
    compareText(left.scopeKey, right.scopeKey)
  );
}

function compareFileScopes(left: ProjectFrameworkFileScope, right: ProjectFrameworkFileScope): number {
  return compareText(left.rootPath, right.rootPath) || compareText(left.sourceFileId, right.sourceFileId);
}

function compareEvidence(left: ProjectFrameworkScopeEvidence, right: ProjectFrameworkScopeEvidence): number {
  return (
    compareText(left.kind, right.kind) ||
    compareText(left.relativePath, right.relativePath) ||
    compareText(left.sourceFileId, right.sourceFileId) ||
    compareText(left.dependencyEdgeId ?? "", right.dependencyEdgeId ?? "")
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function sha256Content(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
