import { describe, expect, it } from "vitest";

import type {
  ExtractedSourceDependency,
  ExtractedSourceDependencyBinding,
  SourceDependencyExtractionLimits,
  SourceDependencyLanguage,
} from "../../domain/project-dependency-index.types.js";
import { TreeSitterDependencyExtractor } from "./tree-sitter-dependency.extractor.js";

const defaultLimits: SourceDependencyExtractionLimits = {
  maxBindingNameBytes: 512,
  maxBindingsPerDependency: 100,
  maxDependencies: 1_000,
  maxSpecifierBytes: 1_024,
};

describe("TreeSitterDependencyExtractor", () => {
  const extractor = new TreeSitterDependencyExtractor();

  it("extracts JavaScript imports, re-exports, CommonJS declarations, and dynamic imports", () => {
    const result = extract(
      extractor,
      "javascript",
      `import defaultValue, { original as local, direct } from "./module.js";
import * as namespace from "./namespace.js";
import "./side-effect.js";
export { value as publicValue, other } from "./reexport.js";
export * from "./all.js";
export * as bundle from "./bundle.js";
const common = require("./common.cjs");
const { picked: renamed, directPick } = require("./picked.cjs");
const lazy = import("./lazy.js");
async function load() {
  return import("./nested-lazy.js");
}
`,
    );

    expect(dependencySummary(result.dependencies)).toEqual([
      "static_import:./module.js:value:[default:default:defaultValue:-:value,named:original:local:-:value,named:direct:direct:-:value]",
      "static_import:./namespace.js:value:[namespace:*:namespace:-:value]",
      "static_import:./side-effect.js:value:[side_effect:-:-:-:value]",
      "reexport:./reexport.js:value:[reexport_named:value:-:publicValue:value,reexport_named:other:-:other:value]",
      "reexport:./all.js:value:[reexport_all:*:-:-:value]",
      "reexport:./bundle.js:value:[reexport_all:*:-:bundle:value]",
      "require:./common.cjs:value:[commonjs_default:-:common:-:value]",
      "require:./picked.cjs:value:[commonjs_named:picked:renamed:-:value,commonjs_named:directPick:directPick:-:value]",
      "dynamic_import:./lazy.js:value:[]",
      "dynamic_import:./nested-lazy.js:value:[]",
    ]);
    expect(result).toMatchObject({
      hasSyntaxErrors: false,
      omissionReasons: [],
      omittedBindingCount: 0,
      omittedDependencyCount: 0,
    });
  });

  it("uses the JavaScript grammar for JSX without treating JSX strings as dependencies", () => {
    const result = extract(
      extractor,
      "javascriptreact",
      `import React from "react";
export function App() {
  return <main data-module="./not-a-module.js">Arc</main>;
}
`,
    );

    expect(dependencySummary(result.dependencies)).toEqual([
      "static_import:react:value:[default:default:React:-:value]",
    ]);
  });

  it("extracts TypeScript type-only bindings and import-equals declarations", () => {
    const result = extract(
      extractor,
      "typescript",
      `import type DefaultType, { type Item as LocalItem, Value } from "./types.js";
import { type Other, Runtime } from "./mixed.js";
import Service = require("./service.cjs");
export type { Item as PublicItem } from "./public.js";
export { type Kind, Runtime as PublicRuntime } from "./exports.js";
export * as Types from "./namespace.js";
`,
    );

    expect(dependencySummary(result.dependencies)).toEqual([
      "static_import:./types.js:type:[default:default:DefaultType:-:type,named:Item:LocalItem:-:type,named:Value:Value:-:type]",
      "static_import:./mixed.js:value:[named:Other:Other:-:type,named:Runtime:Runtime:-:value]",
      "require:./service.cjs:value:[import_equals:-:Service:-:value]",
      "reexport:./public.js:type:[reexport_named:Item:-:PublicItem:type]",
      "reexport:./exports.js:value:[reexport_named:Kind:-:Kind:type,reexport_named:Runtime:-:PublicRuntime:value]",
      "reexport:./namespace.js:value:[reexport_all:*:-:Types:value]",
    ]);
    expect(result.hasSyntaxErrors).toBe(false);
  });

  it("uses the TSX grammar while extracting only module relationships", () => {
    const result = extract(
      extractor,
      "typescriptreact",
      `import type { ComponentProps } from "react";
import { render } from "./render.js";

export function App(props: ComponentProps<"main">) {
  return <main data-import="./ignored.js">{render(props)}</main>;
}
`,
    );

    expect(dependencySummary(result.dependencies)).toEqual([
      "static_import:react:type:[named:ComponentProps:ComponentProps:-:type]",
      "static_import:./render.js:value:[named:render:render:-:value]",
    ]);
  });

  it("excludes computed, unbound, nested, indirect, and non-require calls", () => {
    const result = extract(
      extractor,
      "javascript",
      `const name = "arc";
import(\`./\${name}.js\`);
import("./with-options.js", { with: { type: "json" } });
require("./unbound.js");
const computed = require(name);
const indirect = condition ? require("./conditional.js") : null;
const member = loader.require("./member.js");
const other = load("./other.js");
function nested() {
  const hidden = require("./nested.js");
}
`,
    );

    expect(result.dependencies).toEqual([]);
  });

  it("retains valid dependencies from a malformed syntax tree", () => {
    const result = extract(
      extractor,
      "typescriptreact",
      `import { ready } from "./ready.js";
const broken = ;
const lazy = import("./lazy.js");
`,
    );

    expect(result.hasSyntaxErrors).toBe(true);
    expect(result.dependencies.map((dependency) => dependency.specifier)).toEqual(["./ready.js", "./lazy.js"]);
  });

  it("decodes escaped specifiers and returns exclusive UTF-8 byte ranges", () => {
    const source = `// 😀
import { café as résumé } from "./caf\\u00e9.js";
`;
    const result = extract(extractor, "typescript", source);
    const dependency = result.dependencies[0];
    const binding = dependency?.bindings[0];
    const bindingStart = source.indexOf("résumé");
    const bindingEnd = bindingStart + "résumé".length;
    const specifierStart = source.indexOf('"./caf');
    const specifierEnd = source.indexOf('";', specifierStart) + 1;

    expect(dependency).toMatchObject({
      specifier: "./café.js",
      specifierRange: {
        endByte: Buffer.byteLength(source.slice(0, specifierEnd), "utf8"),
        endLine: 1,
        startByte: Buffer.byteLength(source.slice(0, specifierStart), "utf8"),
        startLine: 1,
      },
    });
    expect(binding).toMatchObject({
      importedName: "café",
      localName: "résumé",
      range: {
        endByte: Buffer.byteLength(source.slice(0, bindingEnd), "utf8"),
        endColumnByte: Buffer.byteLength(source.slice(source.lastIndexOf("\n", bindingEnd - 1) + 1, bindingEnd)),
        endLine: 1,
        startByte: Buffer.byteLength(source.slice(0, bindingStart), "utf8"),
        startColumnByte: Buffer.byteLength(source.slice(source.lastIndexOf("\n", bindingStart - 1) + 1, bindingStart)),
        startLine: 1,
      },
    });
  });

  it("keeps duplicate dependency and binding identities stable after unrelated source movement", () => {
    const first = extract(
      extractor,
      "typescript",
      `import { value } from "./same.js";
import { value } from "./same.js";
`,
    );
    const shifted = extract(
      extractor,
      "typescript",
      `const unrelated = true;
import { value } from "./same.js";
import { value } from "./same.js";
`,
    );

    expect(new Set(first.dependencies.map((dependency) => dependency.extractionKey)).size).toBe(2);
    expect(shifted.dependencies.map((dependency) => dependency.extractionKey)).toEqual(
      first.dependencies.map((dependency) => dependency.extractionKey),
    );
    expect(shifted.dependencies.map((dependency) => dependency.bindings[0]?.bindingKey)).toEqual(
      first.dependencies.map((dependency) => dependency.bindings[0]?.bindingKey),
    );
  });

  it("returns a successful empty result for files without dependency declarations", () => {
    const result = extract(
      extractor,
      "javascript",
      `export const moduleName = "./not-a-module.js";
console.log(moduleName);
`,
    );

    expect(result).toMatchObject({
      dependencies: [],
      hasSyntaxErrors: false,
      omissionReasons: [],
      omittedBindingCount: 0,
      omittedDependencyCount: 0,
    });
  });

  it("enforces dependency and specifier limits without truncation", () => {
    const dependencyLimited = extractor.extract({
      language: "javascript",
      limits: { ...defaultLimits, maxDependencies: 2 },
      source: 'import "./one.js"; import "./two.js"; import "./three.js";\n',
    });
    const specifierLimited = extractor.extract({
      language: "javascript",
      limits: { ...defaultLimits, maxSpecifierBytes: 8 },
      source: 'import "./too-long.js";\n',
    });

    expect(dependencyLimited.dependencies.map((dependency) => dependency.specifier)).toEqual(["./one.js", "./two.js"]);
    expect(dependencyLimited).toMatchObject({
      omissionReasons: ["dependency_limit"],
      omittedDependencyCount: 1,
    });
    expect(specifierLimited).toMatchObject({
      dependencies: [],
      omissionReasons: ["specifier_text_limit"],
      omittedDependencyCount: 1,
    });
  });

  it("enforces per-dependency binding and binding-name limits without dropping the edge", () => {
    const bindingLimited = extractor.extract({
      language: "typescript",
      limits: { ...defaultLimits, maxBindingsPerDependency: 2 },
      source: 'import { first, second, third } from "./values.js";\n',
    });
    const textLimited = extractor.extract({
      language: "typescript",
      limits: { ...defaultLimits, maxBindingNameBytes: 4 },
      source: 'import { VeryLong as huge, okay } from "./values.js";\n',
    });

    expect(bindingLimited.dependencies[0]?.bindings.map((binding) => binding.localName)).toEqual(["first", "second"]);
    expect(bindingLimited).toMatchObject({
      omissionReasons: ["binding_limit"],
      omittedBindingCount: 1,
      omittedDependencyCount: 0,
    });
    expect(textLimited.dependencies[0]?.bindings.map((binding) => binding.localName)).toEqual(["okay"]);
    expect(textLimited).toMatchObject({
      omissionReasons: ["binding_text_limit"],
      omittedBindingCount: 1,
      omittedDependencyCount: 0,
    });
  });

  it("omits invalid decoded specifiers instead of persisting NUL characters", () => {
    const result = extract(extractor, "javascript", 'import value from "./bad\\x00module.js";\n');

    expect(result).toMatchObject({
      dependencies: [],
      omissionReasons: ["invalid_specifier"],
      omittedDependencyCount: 1,
    });
  });

  it("reports supported dialects and dependency-query-versioned extractor identities", () => {
    expect(extractor.supports("typescriptreact")).toBe(true);
    expect(extractor.supports("python")).toBe(false);
    expect(extractor.getExtractorIdentity("javascript")).toContain("/javascript/arc-dependency-query@1");
    expect(extractor.getExtractorIdentity("typescriptreact")).toContain("/tsx/arc-dependency-query@1");
  });

  it("rejects invalid extraction limits", () => {
    expect(() =>
      extractor.extract({
        language: "javascript",
        limits: { ...defaultLimits, maxBindingsPerDependency: 0 },
        source: 'import "./arc.js";\n',
      }),
    ).toThrow(RangeError);
  });
});

function extract(extractor: TreeSitterDependencyExtractor, language: SourceDependencyLanguage, source: string) {
  return extractor.extract({ language, limits: defaultLimits, source });
}

function dependencySummary(dependencies: readonly ExtractedSourceDependency[]): string[] {
  return dependencies.map(
    (dependency) =>
      `${dependency.kind}:${dependency.specifier}:${dependency.typeOnly ? "type" : "value"}:[${dependency.bindings
        .map(bindingSummary)
        .join(",")}]`,
  );
}

function bindingSummary(binding: ExtractedSourceDependencyBinding): string {
  return [
    binding.kind,
    binding.importedName ?? "-",
    binding.localName ?? "-",
    binding.exportedName ?? "-",
    binding.typeOnly ? "type" : "value",
  ].join(":");
}
