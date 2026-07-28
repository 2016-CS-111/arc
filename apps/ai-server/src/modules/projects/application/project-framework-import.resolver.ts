import type {
  ProjectFrameworkDependency,
  ProjectFrameworkImportBinding,
  ProjectFrameworkKind,
} from "../domain/project-framework.types.js";

export class ProjectFrameworkImportResolver {
  public resolve(dependencies: readonly ProjectFrameworkDependency[]): readonly ProjectFrameworkImportBinding[] {
    const bindings: ProjectFrameworkImportBinding[] = [];

    for (const dependency of dependencies) {
      if (dependency.externalPackage === null || dependency.typeOnly) {
        continue;
      }
      const frameworks = frameworksForPackage(dependency.externalPackage);
      if (frameworks.length === 0) {
        continue;
      }
      for (const binding of dependency.bindings) {
        if (binding.localName === null || binding.typeOnly) {
          continue;
        }
        for (const framework of frameworks) {
          bindings.push({
            bindingKey: binding.bindingKey,
            dependencyEdgeId: dependency.id,
            framework,
            importedName: binding.importedName ?? importedNameForBindingKind(binding.kind),
            localName: binding.localName,
            packageName: dependency.externalPackage,
            sourceFileId: dependency.sourceFileId,
            sourceRelativePath: dependency.sourceRelativePath,
          });
        }
      }
    }

    return bindings.sort(compareBindings);
  }

  public find(
    bindings: readonly ProjectFrameworkImportBinding[],
    sourceFileId: string,
    localName: string,
    framework?: ProjectFrameworkKind,
  ): ProjectFrameworkImportBinding | null {
    return (
      bindings.find(
        (binding) =>
          binding.sourceFileId === sourceFileId &&
          binding.localName === localName &&
          (framework === undefined || binding.framework === framework),
      ) ?? null
    );
  }
}

export function frameworksForPackage(packageName: string): readonly ProjectFrameworkKind[] {
  if (packageName === "@nestjs/common" || packageName === "@nestjs/core") {
    return ["nestjs"];
  }
  if (packageName === "express") {
    return ["express"];
  }
  if (packageName === "next") {
    return ["nextjs", "react"];
  }
  if (packageName === "react" || packageName === "react-dom") {
    return ["react"];
  }
  if (packageName === "sequelize") {
    return ["sequelize"];
  }
  return [];
}

function importedNameForBindingKind(kind: string): string {
  if (kind === "default" || kind === "commonjs_default") {
    return "default";
  }
  if (kind === "namespace" || kind === "import_equals") {
    return "*";
  }
  return "unknown";
}

function compareBindings(left: ProjectFrameworkImportBinding, right: ProjectFrameworkImportBinding): number {
  return (
    compareText(left.sourceRelativePath, right.sourceRelativePath) ||
    compareText(left.sourceFileId, right.sourceFileId) ||
    compareText(left.localName, right.localName) ||
    compareText(left.framework, right.framework) ||
    compareText(left.importedName, right.importedName) ||
    compareText(left.dependencyEdgeId, right.dependencyEdgeId) ||
    compareText(left.bindingKey, right.bindingKey)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
