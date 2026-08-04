import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  PrepareProjectModuleResolverInput,
  ProjectModuleMetadataFile,
  ResolveProjectModuleInput,
} from "../../domain/project-module-resolution.types.js";
import { CatalogModuleResolutionHost } from "./catalog-module-resolution.host.js";
import {
  TYPESCRIPT_MODULE_RESOLVER_VERSION,
  TypeScriptProjectModuleResolver,
} from "./typescript-project-module.resolver.js";

const rootPath = "/virtual/arc";

describe("TypeScriptProjectModuleResolver", () => {
  const resolver = new TypeScriptProjectModuleResolver();

  it("resolves relative extension substitution and configured path aliases", () => {
    const context = resolver.prepare(createProjectFixture());

    expect(resolve(context, "./value.js")).toEqual({
      kind: "local",
      targetRelativePath: "src/value.ts",
      targetSourceFileId: "file:src/value.ts",
    });
    expect(resolve(context, "@root/value")).toEqual({
      kind: "local",
      targetRelativePath: "src/value.ts",
      targetSourceFileId: "file:src/value.ts",
    });
    expect(
      context.resolve({
        containingRelativePath: "packages/feature/src/main.ts",
        mode: "import",
        specifier: "@local/value",
      }),
    ).toEqual({
      kind: "local",
      targetRelativePath: "packages/feature/src/value.ts",
      targetSourceFileId: "file:packages/feature/src/value.ts",
    });
    expect(context.warnings).toEqual([]);
  });

  it("honors package imports and self-name exports for import and require modes", () => {
    const context = resolver.prepare(createProjectFixture());

    expect(resolve(context, "#internal", "import")).toEqual({
      kind: "local",
      targetRelativePath: "src/internal-import.ts",
      targetSourceFileId: "file:src/internal-import.ts",
    });
    expect(resolve(context, "#internal", "require")).toEqual({
      kind: "local",
      targetRelativePath: "src/internal-require.ts",
      targetSourceFileId: "file:src/internal-require.ts",
    });
    expect(resolve(context, "@fixture/root/feature", "import")).toEqual({
      kind: "local",
      targetRelativePath: "src/export-import.ts",
      targetSourceFileId: "file:src/export-import.ts",
    });
    expect(resolve(context, "@fixture/root/feature", "require")).toEqual({
      kind: "local",
      targetRelativePath: "src/export-require.ts",
      targetSourceFileId: "file:src/export-require.ts",
    });
  });

  it("classifies built-ins, external packages, and unresolved project claims", () => {
    const context = resolver.prepare(createProjectFixture());

    expect(resolve(context, "fs/promises")).toEqual({
      builtinName: "node:fs/promises",
      kind: "builtin",
    });
    expect(resolve(context, "node:test")).toEqual({
      builtinName: "node:test",
      kind: "builtin",
    });
    expect(resolve(context, "react/jsx-runtime")).toEqual({
      kind: "external",
      packageName: "react",
    });
    expect(resolve(context, "@scope/package/subpath")).toEqual({
      kind: "external",
      packageName: "@scope/package",
    });
    expect(resolve(context, "@missing/value")).toEqual({
      kind: "unresolved",
      reason: "not_found",
    });
    expect(resolve(context, "@fixture/root/missing")).toEqual({
      kind: "unresolved",
      reason: "not_found",
    });
    expect(resolve(context, "#missing")).toEqual({
      kind: "unresolved",
      reason: "not_found",
    });
    expect(resolve(context, "./missing.js")).toEqual({
      kind: "unresolved",
      reason: "not_found",
    });
  });

  it("rejects unsafe, unsupported, malformed, and unknown-containing-file requests", () => {
    const context = resolver.prepare(createProjectFixture());

    expect(resolve(context, "../../outside.ts")).toEqual({
      kind: "unresolved",
      reason: "outside_project",
    });
    expect(resolve(context, "/absolute/file.ts")).toEqual({
      kind: "unresolved",
      reason: "outside_project",
    });
    expect(resolve(context, "file:///tmp/file.ts")).toEqual({
      kind: "unresolved",
      reason: "unsupported_scheme",
    });
    expect(resolve(context, "https://example.com/module.ts")).toEqual({
      kind: "unresolved",
      reason: "unsupported_scheme",
    });
    expect(resolve(context, "@scope")).toEqual({
      kind: "unresolved",
      reason: "invalid_specifier",
    });
    expect(resolve(context, "bad\\module")).toEqual({
      kind: "unresolved",
      reason: "invalid_specifier",
    });
    expect(
      context.resolve({
        containingRelativePath: "src/not-in-catalog.ts",
        mode: "import",
        specifier: "./value.js",
      }),
    ).toEqual({
      kind: "unresolved",
      reason: "not_in_source_catalog",
    });
    expect(
      context.resolve({
        containingRelativePath: "src/not-in-catalog.ts",
        mode: "import",
        specifier: "node:path",
      }),
    ).toEqual({
      kind: "unresolved",
      reason: "not_in_source_catalog",
    });
  });

  it("reports bounded configuration and package metadata warnings", () => {
    const input = createInput(
      [
        "src/main.ts",
        "tsconfig.json",
        "configs/tsconfig.base.json",
        "packages/unsafe/src/main.ts",
        "packages/unsafe/tsconfig.json",
        "package.json",
      ],
      {
        "configs/tsconfig.base.json": '{"extends":"../tsconfig.json"}',
        "package.json": "{ invalid",
        "packages/unsafe/tsconfig.json": '{"extends":"../../../../outside.json"}',
        "tsconfig.json":
          '{"extends":["./configs/tsconfig.base.json","./missing.json"],"compilerOptions":{"module":"invalid"}}',
      },
    );
    const context = resolver.prepare(input);
    const warningCodes = context.warnings.map((warning) => warning.code);

    expect(warningCodes).toContain("config_invalid");
    expect(warningCodes).toContain("config_extends_missing");
    expect(warningCodes).toContain("config_extends_outside_project");
    expect(warningCodes).toContain("config_extends_cycle");
    expect(warningCodes).toContain("package_metadata_invalid");
    expect(context.warnings.every((warning) => warning.relativePath?.startsWith("/") !== true)).toBe(true);
  });

  it("uses a conservative NodeNext fallback and reports files without a config", () => {
    const context = resolver.prepare(createInput(["src/main.ts", "src/value.ts"], {}));

    expect(resolve(context, "./value.js")).toEqual({
      kind: "local",
      targetRelativePath: "src/value.ts",
      targetSourceFileId: "file:src/value.ts",
    });
    expect(context.warnings).toContainEqual({
      code: "config_missing",
      relativePath: null,
    });
  });

  it("selects jsconfig and ignores file-list diagnostics that do not affect resolution", () => {
    const context = resolver.prepare(
      createInput(["src/main.js", "src/value.js", "jsconfig.json"], {
        "jsconfig.json": JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            module: "ESNext",
            moduleResolution: "Bundler",
            paths: {
              "@js/*": ["src/*.js"],
            },
          },
          files: [],
        }),
      }),
    );

    expect(
      context.resolve({
        containingRelativePath: "src/main.js",
        mode: "import",
        specifier: "@js/value",
      }),
    ).toEqual({
      kind: "local",
      targetRelativePath: "src/value.js",
      targetSourceFileId: "file:src/value.js",
    });
    expect(context.warnings).toEqual([]);
  });

  it("builds deterministic context and resolver identities without source content", () => {
    const input = createProjectFixture();
    const first = resolver.prepare(input);
    const reordered = resolver.prepare({
      ...input,
      files: [...input.files].reverse(),
      metadataFiles: [...input.metadataFiles].reverse(),
    });
    const normalized = resolver.prepare({
      ...input,
      files: input.files.map((file) =>
        file.relativePath === "src/main.ts" ? { ...file, relativePath: "./src/main.ts" } : file,
      ),
    });
    const changed = resolver.prepare({
      ...input,
      files: [...input.files, { relativePath: "src/new.ts", sourceFileId: "file:src/new.ts" }],
    });

    expect(first.resolverIdentity).toBe(`typescript@${TYPESCRIPT_MODULE_RESOLVER_VERSION}/arc-module-resolver@1`);
    expect(first.resolutionContextHash).toMatch(/^[a-f\d]{64}$/u);
    expect(reordered.resolutionContextHash).toBe(first.resolutionContextHash);
    expect(normalized.resolutionContextHash).toBe(first.resolutionContextHash);
    expect(changed.resolutionContextHash).not.toBe(first.resolutionContextHash);
  });
});

describe("CatalogModuleResolutionHost", () => {
  it("exposes catalog existence but reads only approved hash-verified metadata", () => {
    const input = createInput(["src/main.ts", "tsconfig.json", "notes.json"], {
      "tsconfig.json": '{"compilerOptions":{"module":"NodeNext"}}',
    });
    const host = new CatalogModuleResolutionHost(input);

    expect(host.fileExists(`${rootPath}/src/main.ts`)).toBe(true);
    expect(host.readFile(`${rootPath}/src/main.ts`)).toBeUndefined();
    expect(host.readFile(`${rootPath}/tsconfig.json`)).toContain("compilerOptions");
    expect(host.fileExists("/outside/secret.ts")).toBe(false);
    expect(host.readFile("/outside/secret.ts")).toBeUndefined();
    expect(host.realpath("/outside/secret.ts")).toBe("");
    expect(host.getDeniedPathCount()).toBeGreaterThan(0);
  });

  it("rejects unsafe paths, duplicate identities, oversized metadata, and hash drift", () => {
    expect(() => createHost(["../secret.ts"], {})).toThrow(RangeError);
    expect(
      () =>
        new CatalogModuleResolutionHost({
          ...createInput(["src/first.ts", "src/second.ts"], {}),
          files: [
            { relativePath: "src/first.ts", sourceFileId: "duplicate" },
            { relativePath: "src/second.ts", sourceFileId: "duplicate" },
          ],
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new CatalogModuleResolutionHost({
          ...createInput(["tsconfig.json"], { "tsconfig.json": "{}" }),
          maxMetadataBytes: 1,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new CatalogModuleResolutionHost({
          ...createInput(["tsconfig.json"], { "tsconfig.json": "{}" }),
          metadataFiles: [
            {
              content: "{}",
              contentHash: "0".repeat(64),
              relativePath: "tsconfig.json",
            },
          ],
        }),
    ).toThrow(RangeError);
  });
});

function createProjectFixture(): PrepareProjectModuleResolverInput {
  return createInput(
    [
      "src/main.ts",
      "src/value.ts",
      "src/internal-import.ts",
      "src/internal-require.ts",
      "src/export-import.ts",
      "src/export-require.ts",
      "packages/feature/src/main.ts",
      "packages/feature/src/value.ts",
      "tsconfig.json",
      "packages/feature/tsconfig.json",
      "package.json",
    ],
    {
      "package.json": JSON.stringify({
        exports: {
          "./feature": {
            import: "./src/export-import.ts",
            require: "./src/export-require.ts",
          },
        },
        imports: {
          "#internal": {
            import: "./src/internal-import.ts",
            require: "./src/internal-require.ts",
          },
        },
        name: "@fixture/root",
        type: "module",
      }),
      "packages/feature/tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          paths: {
            "@local/*": ["src/*.ts"],
          },
        },
        extends: "../../tsconfig.json",
      }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          paths: {
            "@missing/*": ["missing/*.ts"],
            "@root/*": ["src/*.ts"],
          },
          resolveJsonModule: true,
        },
      }),
    },
  );
}

function createHost(paths: readonly string[], metadata: Readonly<Record<string, string>>): CatalogModuleResolutionHost {
  return new CatalogModuleResolutionHost(createInput(paths, metadata));
}

function createInput(
  paths: readonly string[],
  metadata: Readonly<Record<string, string>>,
): PrepareProjectModuleResolverInput {
  return {
    files: paths.map((relativePath) => ({
      relativePath,
      sourceFileId: `file:${relativePath}`,
    })),
    maxMetadataBytes: 1_048_576,
    metadataFiles: Object.entries(metadata).map(([relativePath, content]): ProjectModuleMetadataFile => ({
      content,
      contentHash: createHash("sha256").update(content, "utf8").digest("hex"),
      relativePath,
    })),
    rootPath,
  };
}

function resolve(
  context: ReturnType<TypeScriptProjectModuleResolver["prepare"]>,
  specifier: string,
  mode: ResolveProjectModuleInput["mode"] = "import",
) {
  return context.resolve({
    containingRelativePath: "src/main.ts",
    mode,
    specifier,
  });
}
