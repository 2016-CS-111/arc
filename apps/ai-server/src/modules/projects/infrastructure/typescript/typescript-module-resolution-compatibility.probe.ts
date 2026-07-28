import { createHash } from "node:crypto";

import ts from "typescript";

import type {
  PrepareProjectModuleResolverInput,
  ProjectModuleResolution,
  ProjectModuleResolutionWarning,
} from "../../domain/project-module-resolution.types.js";
import { TypeScriptProjectModuleResolver } from "./typescript-project-module.resolver.js";

export interface TypeScriptModuleResolutionCompatibilityResult {
  readonly builtin: ProjectModuleResolution;
  readonly external: ProjectModuleResolution;
  readonly importCondition: ProjectModuleResolution;
  readonly relativeImport: ProjectModuleResolution;
  readonly requireCondition: ProjectModuleResolution;
  readonly resolutionContextHash: string;
  readonly resolverIdentity: string;
  readonly rootEscape: ProjectModuleResolution;
  readonly typescriptVersion: string;
  readonly warnings: readonly ProjectModuleResolutionWarning[];
}

export class TypeScriptModuleResolutionCompatibilityProbe {
  public constructor(private readonly resolver = new TypeScriptProjectModuleResolver()) {}

  public inspect(): TypeScriptModuleResolutionCompatibilityResult {
    const context = this.resolver.prepare(createProbeInput());

    return {
      builtin: context.resolve({
        containingRelativePath: "src/main.ts",
        mode: "import",
        specifier: "node:path",
      }),
      external: context.resolve({
        containingRelativePath: "src/main.ts",
        mode: "import",
        specifier: "@nestjs/common",
      }),
      importCondition: context.resolve({
        containingRelativePath: "src/main.ts",
        mode: "import",
        specifier: "#mode",
      }),
      relativeImport: context.resolve({
        containingRelativePath: "src/main.ts",
        mode: "import",
        specifier: "./value.js",
      }),
      requireCondition: context.resolve({
        containingRelativePath: "src/main.ts",
        mode: "require",
        specifier: "#mode",
      }),
      resolutionContextHash: context.resolutionContextHash,
      resolverIdentity: context.resolverIdentity,
      rootEscape: context.resolve({
        containingRelativePath: "src/main.ts",
        mode: "import",
        specifier: "../../outside.ts",
      }),
      typescriptVersion: ts.version,
      warnings: context.warnings,
    };
  }
}

function createProbeInput(): PrepareProjectModuleResolverInput {
  const packageContent = JSON.stringify({
    imports: {
      "#mode": {
        import: "./src/import-mode.ts",
        require: "./src/require-mode.ts",
      },
    },
    name: "arc-module-resolution-probe",
    type: "module",
  });
  const configContent = JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
    },
  });

  return {
    files: [
      "package.json",
      "tsconfig.json",
      "src/main.ts",
      "src/value.ts",
      "src/import-mode.ts",
      "src/require-mode.ts",
    ].map((relativePath) => ({
      relativePath,
      sourceFileId: `probe:${relativePath}`,
    })),
    maxMetadataBytes: 1_048_576,
    metadataFiles: [metadata("package.json", packageContent), metadata("tsconfig.json", configContent)],
    rootPath: "/arc-module-resolution-probe",
  };
}

function metadata(relativePath: string, content: string) {
  return {
    content,
    contentHash: createHash("sha256").update(content, "utf8").digest("hex"),
    relativePath,
  };
}
