import { createConsoleLogger } from "@arc/shared";

import { TreeSitterCompatibilityProbe } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-compatibility.probe.js";
import type { TreeSitterLanguageId } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-language.registry.js";

interface SmokeFixture {
  readonly languageId: TreeSitterLanguageId;
  readonly source: string;
}

const fixtures: readonly SmokeFixture[] = [
  {
    languageId: "javascript",
    source: "export function arc() { return true; }\n",
  },
  {
    languageId: "javascriptreact",
    source: "export function Arc() { return <main>Arc</main>; }\n",
  },
  {
    languageId: "typescript",
    source: "export function arc(value: string): string { return value; }\n",
  },
  {
    languageId: "typescriptreact",
    source: "export function Arc(props: { name: string }) { return <main>{props.name}</main>; }\n",
  },
];

function main(): void {
  const logger = createConsoleLogger("tree-sitter-smoke");
  const probe = new TreeSitterCompatibilityProbe();
  const results = fixtures.map((fixture) => ({
    languageId: fixture.languageId,
    result: probe.inspect({
      ...fixture,
      query: "(identifier) @identifier",
    }),
  }));

  for (const { languageId, result } of results) {
    assert(result.rootType === "program", `${languageId} did not produce a program root.`);
    assert(!result.hasError, `${languageId} unexpectedly produced a syntax error.`);
    assert(result.captures.length > 0, `${languageId} did not produce an identifier query capture.`);
  }

  const unicode = probe.inspect({
    languageId: "javascript",
    query: "(identifier) @identifier",
    source: 'const π = "😀";\nconst café = π;\n',
  });
  const cafe = unicode.captures.find((capture) => capture.text === "café");
  assert(cafe?.range.startByte === 25, "Unicode start offset was not normalized to UTF-8 bytes.");
  assert(cafe.range.endByte === 30, "Unicode end offset was not normalized to UTF-8 bytes.");

  const malformed = probe.inspect({
    languageId: "typescriptreact",
    query: "(identifier) @identifier",
    source: "export function Arc() { return <main>;\n",
  });
  assert(malformed.hasError, "Malformed TSX should produce an error-bearing tree.");

  const lifecycleIterations = probe.repeat(
    {
      languageId: "typescript",
      query: "(identifier) @identifier",
      source: "export const arc: string = 'ready';\n",
    },
    100,
  );
  logger.info("Native Tree-sitter compatibility smoke passed", {
    architecture: process.arch,
    languages: results.map(({ languageId }) => languageId),
    lifecycleIterations,
    node: process.version,
    parserIdentities: results.map(({ result }) => result.parserIdentity),
    platform: process.platform,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main();
