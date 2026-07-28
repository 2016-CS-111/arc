import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  DetectProjectFrameworkScopesInput,
  ProjectFrameworkPackageMetadata,
} from "../domain/project-framework.types.js";
import { ProjectFrameworkScopeDetector } from "./project-framework-scope.detector.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";

describe("ProjectFrameworkScopeDetector", () => {
  const detector = new ProjectFrameworkScopeDetector();

  it("creates deterministic root and nested package scopes with nearest-package file ownership", () => {
    const input = fixture();
    const first = detector.detect(input);
    const reordered = detector.detect({
      ...input,
      dependencies: [...input.dependencies].reverse(),
      packageMetadata: [...input.packageMetadata].reverse(),
      sourceFiles: [...input.sourceFiles].reverse(),
    });

    expect(first).toEqual(reordered);
    expect(first.scopes.map((scope) => `${scope.rootPath}:${scope.framework}`)).toEqual([
      ".:express",
      "apps/web:nextjs",
      "apps/web:react",
      "packages/data:sequelize",
    ]);
    expect(first.fileScopes).toEqual([
      expect.objectContaining({ frameworks: ["express"], rootPath: ".", sourceFileId: "root-package" }),
      expect.objectContaining({ frameworks: ["express"], rootPath: ".", sourceFileId: "root-source" }),
      expect.objectContaining({
        frameworks: ["nextjs", "react"],
        rootPath: "apps/web",
        sourceFileId: "web-package",
      }),
      expect.objectContaining({
        frameworks: ["nextjs", "react"],
        rootPath: "apps/web",
        sourceFileId: "web-page",
      }),
      expect.objectContaining({
        frameworks: ["sequelize"],
        rootPath: "packages/data",
        sourceFileId: "data-model",
      }),
      expect.objectContaining({
        frameworks: ["sequelize"],
        rootPath: "packages/data",
        sourceFileId: "data-package",
      }),
    ]);
    expect(first.scopes.every((scope) => /^[0-9a-f]{64}$/u.test(scope.scopeKey))).toBe(true);
    expect(first.scopes.every((scope) => /^[0-9a-f]{64}$/u.test(scope.contextHash))).toBe(true);
  });

  it("supplements package metadata with import-only framework activation", () => {
    const packageMetadata = metadata("root-package", "package.json", { name: "arc" });
    const result = detector.detect({
      dependencies: [
        {
          bindings: [],
          externalPackage: "@nestjs/common",
          id: "nest-edge",
          sourceFileId: "main",
          sourceRelativePath: "src/main.ts",
          specifier: "@nestjs/common",
          typeOnly: false,
        },
      ],
      packageMetadata: [packageMetadata],
      projectId,
      sourceFiles: [
        { relativePath: "package.json", sourceFileId: "root-package" },
        { relativePath: "src/main.ts", sourceFileId: "main" },
      ],
    });

    expect(result.scopes).toEqual([
      expect.objectContaining({
        evidence: [expect.objectContaining({ dependencyEdgeId: "nest-edge", kind: "import_binding" })],
        framework: "nestjs",
        rootPath: ".",
      }),
    ]);
  });

  it("does not activate a runtime framework from a type-only import", () => {
    const packageMetadata = metadata("root-package", "package.json", { name: "arc" });
    const result = detector.detect({
      dependencies: [
        {
          bindings: [],
          externalPackage: "@nestjs/common",
          id: "nest-types",
          sourceFileId: "types",
          sourceRelativePath: "src/types.ts",
          specifier: "@nestjs/common",
          typeOnly: true,
        },
      ],
      packageMetadata: [packageMetadata],
      projectId,
      sourceFiles: [
        { relativePath: "package.json", sourceFileId: "root-package" },
        { relativePath: "src/types.ts", sourceFileId: "types" },
      ],
    });

    expect(result.scopes).toEqual([]);
  });

  it("warns for malformed package JSON but rejects stale or unverified catalog inputs", () => {
    const malformedContent = "{";
    const malformed = {
      content: malformedContent,
      contentHash: hash(malformedContent),
      relativePath: "package.json",
      sourceFileId: "package",
    };
    const base = {
      dependencies: [],
      packageMetadata: [malformed],
      projectId,
      sourceFiles: [{ relativePath: "package.json", sourceFileId: "package" }],
    };

    expect(detector.detect(base).warnings).toEqual([
      { code: "package_metadata_invalid", relativePath: "package.json" },
    ]);
    expect(() =>
      detector.detect({
        ...base,
        packageMetadata: [{ ...malformed, contentHash: "0".repeat(64) }],
      }),
    ).toThrow("metadata identity is invalid");
    expect(() =>
      detector.detect({
        ...base,
        sourceFiles: [
          { relativePath: "package.json", sourceFileId: "package" },
          { relativePath: "package.json", sourceFileId: "duplicate" },
        ],
      }),
    ).toThrow("unique source file IDs and paths");
  });
});

function fixture(): DetectProjectFrameworkScopesInput {
  return {
    dependencies: [
      {
        bindings: [],
        externalPackage: "sequelize",
        id: "sequelize-edge",
        sourceFileId: "data-model",
        sourceRelativePath: "packages/data/model.ts",
        specifier: "sequelize",
        typeOnly: false,
      },
    ],
    packageMetadata: [
      metadata("root-package", "package.json", { dependencies: { express: "^5" }, name: "arc" }),
      metadata("web-package", "apps/web/package.json", { dependencies: { next: "^15" }, name: "web" }),
      metadata("data-package", "packages/data/package.json", { name: "data" }),
    ],
    projectId,
    sourceFiles: [
      { relativePath: "package.json", sourceFileId: "root-package" },
      { relativePath: "src/server.ts", sourceFileId: "root-source" },
      { relativePath: "apps/web/package.json", sourceFileId: "web-package" },
      { relativePath: "apps/web/app/page.tsx", sourceFileId: "web-page" },
      { relativePath: "packages/data/package.json", sourceFileId: "data-package" },
      { relativePath: "packages/data/model.ts", sourceFileId: "data-model" },
    ],
  };
}

function metadata(
  sourceFileId: string,
  relativePath: string,
  value: Record<string, unknown>,
): ProjectFrameworkPackageMetadata {
  const content = JSON.stringify(value);
  return { content, contentHash: hash(content), relativePath, sourceFileId };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
