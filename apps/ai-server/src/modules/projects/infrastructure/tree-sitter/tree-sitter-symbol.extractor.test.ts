import { describe, expect, it } from "vitest";

import type {
  ExtractedSourceSymbol,
  SourceSymbolExtractionLimits,
  SourceSymbolLanguage,
} from "../../domain/project-symbol-index.types.js";
import { TreeSitterSymbolExtractor } from "./tree-sitter-symbol.extractor.js";

const defaultLimits: SourceSymbolExtractionLimits = {
  maxNameBytes: 512,
  maxQualifiedNameBytes: 2_048,
  maxSymbols: 5_000,
};

describe("TreeSitterSymbolExtractor", () => {
  const extractor = new TreeSitterSymbolExtractor();

  it("extracts JavaScript declarations, hierarchy, exports, and declaration-level bindings", () => {
    const result = extract(
      extractor,
      "javascript",
      `export class Service {
  value = 1;
  #secret = true;
  constructor() {}
  run() {}
}

export function make() {}
export const handler = () => {};
let count = 0;
function outer() {
  const ignored = 1;
  function nested() {}
  const localHandler = () => {};
}
const object = { method() {} };
`,
    );

    expect(summary(result.symbols)).toEqual([
      "Service:class:exported",
      "Service.value:property:local",
      "Service.#secret:property:local",
      "Service.constructor:constructor:local",
      "Service.run:method:local",
      "make:function:exported",
      "handler:function:exported",
      "count:variable:local",
      "outer:function:local",
      "outer.nested:function:local",
      "outer.localHandler:function:local",
      "object:constant:local",
    ]);
    expect(result.symbols.some((symbol) => symbol.name === "ignored")).toBe(false);
    expect(result.symbols.some((symbol) => symbol.qualifiedName === "object.method")).toBe(false);
  });

  it("uses JavaScript parsing for JSX without treating elements as symbols", () => {
    const result = extract(
      extractor,
      "javascriptreact",
      `export function App() {
  return <main data-mode="arc">Arc</main>;
}
`,
    );

    expect(result.hasSyntaxErrors).toBe(false);
    expect(summary(result.symbols)).toEqual(["App:function:exported"]);
  });

  it("extracts TypeScript declarations and lexical parents", () => {
    const result = extract(
      extractor,
      "typescript",
      `export namespace Core {
  export interface Item {
    readonly id: string;
    run(value: number): void;
  }
  export type Name = string;
  export enum Mode { Active }
  export class Service {
    value = 1;
    constructor() {}
    run(): void {}
  }
  export function make(): void {}
  export const handler = (): void => {};
  let count = 0;
}

declare module "arc" {
  export function boot(): void;
}
`,
    );

    expect(summary(result.symbols)).toEqual([
      "Core:namespace:exported",
      "Core.Item:interface:exported",
      "Core.Item.id:property:local",
      "Core.Item.run:method:local",
      "Core.Name:type_alias:exported",
      "Core.Mode:enum:exported",
      "Core.Service:class:exported",
      "Core.Service.value:property:local",
      "Core.Service.constructor:constructor:local",
      "Core.Service.run:method:local",
      "Core.make:function:exported",
      "Core.handler:function:exported",
      "Core.count:variable:local",
      "arc:module:local",
      "arc.boot:function:exported",
    ]);
  });

  it("uses the TSX grammar while excluding JSX syntax", () => {
    const result = extract(
      extractor,
      "typescriptreact",
      `export interface Props {
  name: string;
}

export function App(props: Props): JSX.Element {
  return <main>{props.name}</main>;
}
`,
    );

    expect(result.hasSyntaxErrors).toBe(false);
    expect(summary(result.symbols)).toEqual([
      "Props:interface:exported",
      "Props.name:property:local",
      "App:function:exported",
    ]);
  });

  it("retains valid symbols from malformed trees", () => {
    const result = extract(
      extractor,
      "typescriptreact",
      `export class Arc {
  run(): void {
    const value = ;
  }
}
`,
    );

    expect(result.hasSyntaxErrors).toBe(true);
    expect(summary(result.symbols)).toEqual(["Arc:class:exported", "Arc.run:method:local"]);
  });

  it("returns exclusive UTF-8 byte ranges for multibyte source", () => {
    const source = `// 😀
export const café = (): string => "ready";
`;
    const result = extract(extractor, "typescript", source);
    const symbol = result.symbols[0];
    const nativeStart = source.indexOf("café");
    const nativeEnd = source.indexOf(";", nativeStart);

    expect(symbol).toMatchObject({
      name: "café",
      range: {
        endByte: Buffer.byteLength(source.slice(0, nativeEnd), "utf8"),
        endColumnByte: Buffer.byteLength(source.slice(source.lastIndexOf("\n", nativeEnd - 1) + 1, nativeEnd)),
        endLine: 1,
        startByte: Buffer.byteLength(source.slice(0, nativeStart), "utf8"),
        startColumnByte: 13,
        startLine: 1,
      },
    });
  });

  it("keeps duplicate identities distinct and stable when unrelated declarations move", () => {
    const first = extract(
      extractor,
      "typescript",
      `function same(): void {}
function same(): void {}
`,
    );
    const shifted = extract(
      extractor,
      "typescript",
      `const unrelated = true;
function same(): void {}
function same(): void {}
`,
    );

    const firstKeys = first.symbols.filter((symbol) => symbol.name === "same").map((symbol) => symbol.identityKey);
    const shiftedKeys = shifted.symbols.filter((symbol) => symbol.name === "same").map((symbol) => symbol.identityKey);

    expect(new Set(firstKeys).size).toBe(2);
    expect(shiftedKeys).toEqual(firstKeys);
  });

  it("returns a successful empty result for files without declarations", () => {
    const result = extract(
      extractor,
      "javascript",
      `import value from "arc";
export default class {};
void (() => value);
`,
    );

    expect(result).toMatchObject({
      hasSyntaxErrors: false,
      limitReasons: [],
      omittedSymbolCount: 0,
      symbols: [],
    });
  });

  it("enforces symbol and text limits without truncating names", () => {
    const symbolLimited = extractor.extract({
      language: "javascript",
      limits: { ...defaultLimits, maxSymbols: 2 },
      source: "const first = 1; const second = 2; const third = 3;\n",
    });
    const textLimited = extractor.extract({
      language: "javascript",
      limits: { ...defaultLimits, maxNameBytes: 4 },
      source: "class VeryLong { method() {} }\nconst okay = true;\n",
    });

    expect(symbolLimited.symbols.map((symbol) => symbol.name)).toEqual(["first", "second"]);
    expect(symbolLimited).toMatchObject({
      limitReasons: ["symbol_limit"],
      omittedSymbolCount: 1,
    });
    expect(textLimited.symbols.map((symbol) => symbol.name)).toEqual(["okay"]);
    expect(textLimited).toMatchObject({
      limitReasons: ["symbol_text_limit"],
      omittedSymbolCount: 2,
    });
  });

  it("reports supported dialects and query-versioned parser identities", () => {
    expect(extractor.supports("typescriptreact")).toBe(true);
    expect(extractor.supports("python")).toBe(false);
    expect(extractor.getParserIdentity("typescript")).toContain("/typescript/arc-symbol-query@1");
    expect(extractor.getParserIdentity("typescriptreact")).toContain("/tsx/arc-symbol-query@1");
  });

  it("rejects invalid extraction limits", () => {
    expect(() =>
      extractor.extract({
        language: "javascript",
        limits: { ...defaultLimits, maxSymbols: 0 },
        source: "const arc = true;\n",
      }),
    ).toThrow(RangeError);
  });
});

function extract(extractor: TreeSitterSymbolExtractor, language: SourceSymbolLanguage, source: string) {
  return extractor.extract({ language, limits: defaultLimits, source });
}

function summary(symbols: readonly ExtractedSourceSymbol[]): string[] {
  return symbols.map((symbol) => `${symbol.qualifiedName}:${symbol.kind}:${symbol.exported ? "exported" : "local"}`);
}
