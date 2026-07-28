import { createConsoleLogger } from "@arc/shared";

import { ProjectFrameworkImportResolver } from "../modules/projects/application/project-framework-import.resolver.js";
import type {
  ProjectFrameworkDependency,
  SourceFrameworkEvidenceKind,
  SourceFrameworkEvidenceLimits,
  SourceFrameworkLanguage,
} from "../modules/projects/domain/project-framework.types.js";
import { TreeSitterFrameworkEvidenceExtractor } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-framework-evidence.extractor.js";
import { TreeSitterExpressFrameworkAnalyzer } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-express-framework.analyzer.js";
import { TreeSitterNestFrameworkAnalyzer } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-nest-framework.analyzer.js";

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

  const nestSource = `import { Controller, Get, Injectable, Module } from "@nestjs/common";
@Injectable() class ArcService {}
@Controller("arc") class ArcController {
  constructor(private readonly service: ArcService) {}
  @Get(":id") read() {}
}
@Module({ controllers: [ArcController], providers: [ArcService] }) class ArcModule {}
`;
  const nestDependency: ProjectFrameworkDependency = {
    bindings: ["Controller", "Get", "Injectable", "Module"].map((name) => ({
      bindingKey: name,
      importedName: name,
      kind: "named",
      localName: name,
      typeOnly: false,
    })),
    externalPackage: "@nestjs/common",
    id: "nest-smoke-edge",
    sourceFileId: "nest-smoke-source",
    sourceRelativePath: "src/arc.module.ts",
    specifier: "@nestjs/common",
    typeOnly: false,
  };
  const nestEvidence = extractor.extract({
    language: "typescript",
    limits,
    source: nestSource,
  });
  const nestResult = new TreeSitterNestFrameworkAnalyzer().analyze({
    dependencies: [nestDependency],
    evidence: nestEvidence.evidence,
    importBindings: new ProjectFrameworkImportResolver().resolve([nestDependency]),
    limits: {
      maxEntities: 20,
      maxNameBytes: 128,
      maxRelationships: 40,
    },
    relativePath: "src/arc.module.ts",
    scopeKey: "a".repeat(64),
    sourceFileId: "nest-smoke-source",
    symbols: [],
  });
  assert(
    nestResult.entities.some(
      (entity) => entity.attributes.kind === "nest_route" && entity.attributes.fullPaths.includes("/arc/:id"),
    ),
    "NestJS route composition smoke failed.",
  );
  assert(
    nestResult.relationships.some(
      (relationship) => relationship.relationshipKind === "injects" && relationship.targetName === "ArcService",
    ),
    "NestJS constructor injection smoke failed.",
  );
  assert(!JSON.stringify(nestResult).includes(nestSource), "NestJS analysis retained its source body.");

  const expressSource = `import express, { Router } from "express";
const app = express();
const router = Router();
app.get("/health", handler);
app.use("/api", router);
`;
  const expressDependency: ProjectFrameworkDependency = {
    bindings: [
      { bindingKey: "express", importedName: "default", kind: "default", localName: "express", typeOnly: false },
      { bindingKey: "Router", importedName: "Router", kind: "named", localName: "Router", typeOnly: false },
    ],
    externalPackage: "express",
    id: "express-smoke-edge",
    sourceFileId: "express-smoke-source",
    sourceRelativePath: "src/app.ts",
    specifier: "express",
    typeOnly: false,
  };
  const expressResult = new TreeSitterExpressFrameworkAnalyzer().analyze({
    dependencies: [expressDependency],
    evidence: extractor.extract({ language: "typescript", limits, source: expressSource }).evidence,
    importBindings: new ProjectFrameworkImportResolver().resolve([expressDependency]),
    limits: { maxEntities: 20, maxNameBytes: 128, maxRelationships: 40 },
    relativePath: "src/app.ts",
    scopeKey: "b".repeat(64),
    sourceFileId: "express-smoke-source",
    symbols: [],
  });
  assert(
    expressResult.entities.some(
      (entity) => entity.attributes.kind === "express_route" && entity.attributes.paths.includes("/health"),
    ),
    "Express route extraction smoke failed.",
  );
  assert(
    expressResult.relationships.some(
      (relationship) => relationship.relationshipKind === "mounts_router" && relationship.targetName === "router",
    ),
    "Express router mount smoke failed.",
  );
  assert(!JSON.stringify(expressResult).includes(expressSource), "Express analysis retained its source body.");

  logger.info("Framework evidence compatibility smoke passed", {
    analyzerIdentities: [nestResult.analyzerIdentity, expressResult.analyzerIdentity],
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
