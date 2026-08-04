import { describe, expect, it } from "vitest";

import { TYPESCRIPT_MODULE_RESOLVER_VERSION } from "./typescript-project-module.resolver.js";
import { TypeScriptModuleResolutionCompatibilityProbe } from "./typescript-module-resolution-compatibility.probe.js";

describe("TypeScriptModuleResolutionCompatibilityProbe", () => {
  it("proves the pinned resolver, NodeNext modes, containment, and classifications", () => {
    const result = new TypeScriptModuleResolutionCompatibilityProbe().inspect();

    expect(result).toMatchObject({
      builtin: {
        builtinName: "node:path",
        kind: "builtin",
      },
      external: {
        kind: "external",
        packageName: "@nestjs/common",
      },
      importCondition: {
        kind: "local",
        targetRelativePath: "src/import-mode.ts",
      },
      relativeImport: {
        kind: "local",
        targetRelativePath: "src/value.ts",
      },
      requireCondition: {
        kind: "local",
        targetRelativePath: "src/require-mode.ts",
      },
      rootEscape: {
        kind: "unresolved",
        reason: "outside_project",
      },
      typescriptVersion: TYPESCRIPT_MODULE_RESOLVER_VERSION,
      warnings: [],
    });
    expect(result.resolutionContextHash).toMatch(/^[a-f\d]{64}$/u);
    expect(result.resolverIdentity).toBe(`typescript@${TYPESCRIPT_MODULE_RESOLVER_VERSION}/arc-module-resolver@1`);
  });
});
