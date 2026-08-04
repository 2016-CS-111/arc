import { describe, expect, it } from "vitest";

import { TreeSitterCompatibilityProbe } from "./tree-sitter-compatibility.probe.js";

const identifierQuery = "(identifier) @identifier";

describe("TreeSitterCompatibilityProbe", () => {
  const probe = new TreeSitterCompatibilityProbe();

  it.each([
    {
      languageId: "javascript" as const,
      source: "export function arc() { return true; }\n",
    },
    {
      languageId: "javascriptreact" as const,
      source: "export function Arc() { return <main>Arc</main>; }\n",
    },
    {
      languageId: "typescript" as const,
      source: "export function arc(value: string): string { return value; }\n",
    },
    {
      languageId: "typescriptreact" as const,
      source: "export function Arc(props: { name: string }) { return <main>{props.name}</main>; }\n",
    },
  ])("parses $languageId and executes a query", ({ languageId, source }) => {
    const result = probe.inspect({ languageId, query: identifierQuery, source });

    expect(result).toMatchObject({
      hasError: false,
      rootType: "program",
    });
    expect(result.captures.length).toBeGreaterThan(0);
    expect(result.parserIdentity).toContain("tree-sitter@0.21.1/");
  });

  it("uses the distinct TSX grammar for TypeScript React", () => {
    const source = "export const Arc = (): JSX.Element => <main>Arc</main>;\n";
    const typescript = probe.inspect({
      languageId: "typescript",
      query: identifierQuery,
      source,
    });
    const tsx = probe.inspect({
      languageId: "typescriptreact",
      query: "(jsx_element) @element",
      source,
    });

    expect(typescript.hasError).toBe(true);
    expect(tsx.hasError).toBe(false);
    expect(tsx.captures.map((capture) => capture.text)).toEqual(["<main>Arc</main>"]);
  });

  it("normalizes native UTF-16 indices and columns to exclusive UTF-8 byte ranges", () => {
    const source = 'const π = "😀";\nconst café = π;\n';
    const result = probe.inspect({
      languageId: "javascript",
      query: identifierQuery,
      source,
    });
    const cafe = result.captures.find((capture) => capture.text === "café");

    expect(cafe).toEqual({
      name: "identifier",
      nativeEndIndex: 26,
      nativeStartIndex: 22,
      range: {
        endByte: 30,
        endColumnByte: 11,
        endLine: 1,
        startByte: 25,
        startColumnByte: 6,
        startLine: 1,
      },
      text: "café",
    });
    expect(source.slice(cafe?.nativeStartIndex, cafe?.nativeEndIndex)).toBe("café");
    expect(Buffer.byteLength(source.slice(0, cafe?.nativeStartIndex), "utf8")).toBe(cafe?.range.startByte);
  });

  it("returns a usable tree for malformed input", () => {
    const result = probe.inspect({
      languageId: "typescriptreact",
      query: identifierQuery,
      source: "export function Arc(props: { name: string }) { return <main>{props.name};\n",
    });

    expect(result.rootType).toBe("program");
    expect(result.hasError).toBe(true);
    expect(result.captures.length).toBeGreaterThan(0);
  });

  it("repeatedly parses and releases parser state", () => {
    expect(
      probe.repeat(
        {
          languageId: "typescript",
          query: identifierQuery,
          source: "export const arc: string = 'ready';\n",
        },
        250,
      ),
    ).toBe(250);
  });

  it("rejects invalid lifecycle iteration counts", () => {
    expect(() =>
      probe.repeat(
        {
          languageId: "javascript",
          query: identifierQuery,
          source: "const arc = true;\n",
        },
        0,
      ),
    ).toThrow(RangeError);
  });
});
