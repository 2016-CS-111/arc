import { createConsoleLogger } from "@arc/shared";

import type {
  SourceFrameworkEvidenceKind,
  SourceFrameworkEvidenceLimits,
  SourceFrameworkLanguage,
} from "../modules/projects/domain/project-framework.types.js";
import { TreeSitterFrameworkEvidenceExtractor } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-framework-evidence.extractor.js";

interface SmokeFixture {
  readonly expectedKinds: readonly SourceFrameworkEvidenceKind[];
  readonly language: SourceFrameworkLanguage;
  readonly source: string;
}

const limits: SourceFrameworkEvidenceLimits = {
  maxCollectionEntries: 20,
  maxEvidence: 100,
  maxNameBytes: 128,
  maxStaticDepth: 8,
  maxStaticValueBytes: 4096,
};

const fixtures: readonly SmokeFixture[] = [
  {
    expectedKinds: ["call_expression"],
    language: "javascript",
    source: "const app = express(); app.use(router);\n",
  },
  {
    expectedKinds: ["call_expression", "jsx"],
    language: "javascriptreact",
    source: "const app = createApp(); const view = <App />;\n",
  },
  {
    expectedKinds: ["decorator", "call_expression", "class_heritage"],
    language: "typescript",
    source: '@Controller("/arc") class ArcController extends Base.Controller {}\n',
  },
  {
    expectedKinds: ["directive", "jsx"],
    language: "typescriptreact",
    source: '"use client"; export const Arc = (): JSX.Element => <Layout.Main />;\n',
  },
];

function main(): void {
  const logger = createConsoleLogger("framework-evidence-smoke");
  const extractor = new TreeSitterFrameworkEvidenceExtractor();
  const results = fixtures.map((fixture) => ({
    fixture,
    result: extractor.extract({
      language: fixture.language,
      limits,
      source: fixture.source,
    }),
  }));

  for (const { fixture, result } of results) {
    assert(!result.hasSyntaxErrors, `${fixture.language} unexpectedly produced a syntax error.`);
    assert(result.omissionReasons.length === 0, `${fixture.language} unexpectedly omitted framework evidence.`);
    const kinds = new Set(result.evidence.map((evidence) => evidence.kind));
    for (const expectedKind of fixture.expectedKinds) {
      assert(kinds.has(expectedKind), `${fixture.language} did not emit ${expectedKind} evidence.`);
    }
    assert(!JSON.stringify(result).includes(fixture.source), `${fixture.language} retained its source body.`);
  }

  logger.info("Framework evidence compatibility smoke passed", {
    architecture: process.arch,
    evidenceCounts: results.map(({ fixture, result }) => ({
      count: result.evidence.length,
      language: fixture.language,
    })),
    extractorIdentities: results.map(({ result }) => result.extractorIdentity),
    node: process.version,
    platform: process.platform,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main();
