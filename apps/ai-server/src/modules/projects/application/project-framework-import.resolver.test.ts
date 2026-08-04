import { describe, expect, it } from "vitest";

import type { ProjectFrameworkDependency } from "../domain/project-framework.types.js";
import { ProjectFrameworkImportResolver } from "./project-framework-import.resolver.js";

describe("ProjectFrameworkImportResolver", () => {
  const resolver = new ProjectFrameworkImportResolver();

  it("resolves aliased, default, namespace, and CommonJS bindings deterministically", () => {
    const bindings = resolver.resolve([
      dependency("edge-sequelize", "sequelize", [
        binding("model", "named", "Model", "BaseModel"),
        binding("namespace", "namespace", null, "SequelizeNS"),
      ]),
      dependency("edge-nest", "@nestjs/common", [binding("controller", "named", "Controller", "HttpController")]),
      dependency("edge-express", "express", [
        binding("default", "default", null, "express"),
        binding("require", "commonjs_default", null, "expressCommonJs"),
      ]),
    ]);

    expect(bindings.map((binding) => `${binding.framework}:${binding.localName}:${binding.importedName}`)).toEqual([
      "sequelize:BaseModel:Model",
      "nestjs:HttpController:Controller",
      "sequelize:SequelizeNS:*",
      "express:express:default",
      "express:expressCommonJs:default",
    ]);
    expect(resolver.find(bindings, "source-file", "HttpController", "nestjs")).toMatchObject({
      importedName: "Controller",
      packageName: "@nestjs/common",
    });
  });

  it("maps Next to both Next.js and React while excluding type-only, local, and unrelated dependencies", () => {
    const bindings = resolver.resolve([
      dependency("edge-next", "next", [binding("image", "default", null, "Image")]),
      {
        ...dependency("edge-types", "@nestjs/common", [binding("types", "named", "TypeOnly", "TypeOnly", false)]),
        typeOnly: true,
      },
      dependency("edge-local", null, [binding("local", "named", "Controller", "Controller")]),
      dependency("edge-other", "unrelated", [binding("other", "named", "Controller", "Controller")]),
    ]);

    expect(bindings.map((binding) => binding.framework)).toEqual(["nextjs", "react"]);
    expect(resolver.find(bindings, "source-file", "missing")).toBeNull();
  });
});

function dependency(
  id: string,
  externalPackage: string | null,
  bindings: ProjectFrameworkDependency["bindings"],
): ProjectFrameworkDependency {
  return {
    bindings,
    externalPackage,
    id,
    sourceFileId: "source-file",
    sourceRelativePath: "src/app.ts",
    specifier: externalPackage ?? "./local.js",
    typeOnly: false,
  };
}

function binding(
  bindingKey: string,
  kind: string,
  importedName: string | null,
  localName: string | null,
  typeOnly = false,
) {
  return { bindingKey, importedName, kind, localName, typeOnly };
}
