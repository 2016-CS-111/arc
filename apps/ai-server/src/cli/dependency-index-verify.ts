import "reflect-metadata";

import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createConsoleLogger } from "@arc/shared";
import type { ProjectDependencyGraphQuery } from "@arc/contracts";

import type { AppConfig } from "../config/env.js";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../database/database.sequelize.js";
import type { ArcDatabase } from "../database/database.types.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";
import { ProjectDependencyGraphService } from "../modules/projects/application/project-dependency-graph.service.js";
import { ProjectDependencyIndexService } from "../modules/projects/application/project-dependency-index.service.js";
import { ProjectIgnorePolicyService } from "../modules/projects/application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "../modules/projects/application/project-inventory.service.js";
import { ProjectPathNormalizer } from "../modules/projects/application/project-path.normalizer.js";
import { ProjectSourceIndexService } from "../modules/projects/application/project-source-index.service.js";
import { SourceLanguageClassifier } from "../modules/projects/application/source-language.classifier.js";
import type { SourceDependencyExtractor } from "../modules/projects/application/source-dependency.extractor.js";
import type { SourceTextReader } from "../modules/projects/application/source-text.reader.js";
import type {
  ExtractSourceDependenciesInput,
  SourceDependencyExtractionResult,
  SourceDependencyLanguage,
} from "../modules/projects/domain/project-dependency-index.types.js";
import { ProjectDependencyCatalogStaleError } from "../modules/projects/domain/project.errors.js";
import { NodeIgnoreRulesFileReader } from "../modules/projects/infrastructure/node-ignore-rules-file.reader.js";
import { NodeRepositoryInventoryWalker } from "../modules/projects/infrastructure/node-repository-inventory.walker.js";
import { NodeSourceTextReader } from "../modules/projects/infrastructure/node-source-text.reader.js";
import { SequelizeProjectDependencyIndexRepository } from "../modules/projects/infrastructure/sequelize-project-dependency-index.repository.js";
import { SequelizeProjectInventoryRepository } from "../modules/projects/infrastructure/sequelize-project-inventory.repository.js";
import { SequelizeProjectRepository } from "../modules/projects/infrastructure/sequelize-project.repository.js";
import { SequelizeProjectSourceIndexRepository } from "../modules/projects/infrastructure/sequelize-project-source-index.repository.js";
import { TreeSitterDependencyExtractor } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-dependency.extractor.js";
import { TypeScriptProjectModuleResolver } from "../modules/projects/infrastructure/typescript/typescript-project-module.resolver.js";

const privateBodyMarker = "ARC_PRIVATE_DEPENDENCY_BODY_91A4";
const mainPath = "src/main.ts";
const aliasSpecifier = "@core/value.js";

interface DependencyVerificationResult {
  readonly appliedMigrations: readonly string[];
  readonly dependencyIndexId: string;
  readonly edgeCount: number;
  readonly recoveredIndexCount: number;
  readonly stableAliasEdgeId: string;
}

interface EdgeSnapshot {
  readonly bindingIds: readonly string[];
  readonly id: string;
  readonly resolutionKind: string;
  readonly specifier: string;
  readonly targetRelativePath: string | null;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("dependency-index-verify");
  const config = loadConfig();
  const result = await verifyDependencyIndex(config);

  logger.info("PostgreSQL project dependency-index verification passed", {
    appliedMigrations: result.appliedMigrations,
    database: new URL(config.database.url).pathname,
    dependencyIndexId: result.dependencyIndexId,
    edgeCount: result.edgeCount,
    recoveredIndexCount: result.recoveredIndexCount,
    stableAliasEdgeId: result.stableAliasEdgeId,
  });
}

async function verifyDependencyIndex(config: AppConfig): Promise<DependencyVerificationResult> {
  const firstDatabase = createDatabase(config);
  let recoveryDatabase: ArcDatabase | undefined;
  let firstDatabaseClosed = false;
  let projectId: string | undefined;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arc-dependency-verify-"));

  try {
    await createFixture(temporaryRoot);
    await firstDatabase.sequelize.authenticate();
    const appliedMigrations = await runMigrations(firstDatabase.sequelize, await loadMigrations());
    const projectRepository = new SequelizeProjectRepository(firstDatabase);
    const registration = await projectRepository.register({
      name: "Arc dependency verification",
      rootPath: await realpath(temporaryRoot),
    });
    projectId = registration.project.id;

    const inventoryRepository = new SequelizeProjectInventoryRepository(firstDatabase);
    const pathNormalizer = new ProjectPathNormalizer();
    const ignorePolicy = new ProjectIgnorePolicyService(
      projectRepository,
      new NodeIgnoreRulesFileReader(),
      pathNormalizer,
    );
    const inventoryService = new ProjectInventoryService(
      projectRepository,
      inventoryRepository,
      new NodeRepositoryInventoryWalker(),
      ignorePolicy,
      config,
    );
    const sourceRepository = new SequelizeProjectSourceIndexRepository(firstDatabase);
    const sourceService = new ProjectSourceIndexService(
      projectRepository,
      inventoryRepository,
      sourceRepository,
      new NodeSourceTextReader(),
      ignorePolicy,
      new SourceLanguageClassifier(),
      config,
    );
    const dependencyRepository = new SequelizeProjectDependencyIndexRepository(firstDatabase);
    const countingReader = new CountingSourceTextReader(new NodeSourceTextReader());
    const countingExtractor = new CountingDependencyExtractor(new TreeSitterDependencyExtractor());
    const dependencyService = new ProjectDependencyIndexService(
      projectRepository,
      inventoryRepository,
      sourceRepository,
      dependencyRepository,
      countingReader,
      countingExtractor,
      new TypeScriptProjectModuleResolver(),
      config,
    );
    const graphService = new ProjectDependencyGraphService(
      projectRepository,
      sourceRepository,
      dependencyRepository,
      pathNormalizer,
      config,
    );

    const initialInventory = await inventoryService.scan(projectId);
    assert(initialInventory.status === "completed", "The dependency fixture inventory should complete.");
    const initialSourceIndex = await sourceService.index(projectId);
    assert(initialSourceIndex.status === "completed", "The dependency fixture source index should complete.");

    const initialIndex = await dependencyService.index(projectId);
    assert(initialIndex.status === "completed", "The initial dependency index should complete.");
    assert(initialIndex.edgeCount >= 9, "The fixture should produce representative dependency edges.");
    assert(initialIndex.localEdgeCount >= 6, "The fixture should contain local dependency edges.");
    assert(initialIndex.externalEdgeCount >= 1, "The fixture should classify an external package.");
    assert(initialIndex.builtinEdgeCount >= 1, "The fixture should classify a Node built-in.");
    assert(initialIndex.unresolvedEdgeCount >= 1, "The fixture should retain an unresolved dependency.");
    await assertDialectCoverage(firstDatabase, projectId);

    const initialSnapshot = await getMainEdgeSnapshot(firstDatabase, projectId);
    const initialAlias = findEdge(initialSnapshot, aliasSpecifier);
    assert(initialAlias?.resolutionKind === "local", "The configured alias should initially resolve locally.");
    assert(initialAlias.targetRelativePath === "src/core/value.ts", "The alias should target src/core/value.ts.");
    assert(initialAlias.bindingIds.length > 0, "The alias edge should retain imported binding identity.");

    const mainGraph = await graphService.getGraph(
      projectId,
      graphQuery({ depth: 2, includeBindings: true, path: mainPath }),
    );
    assert(
      mainGraph.nodes.some((node) => node.kind === "external" && node.packageName === "react"),
      "The graph should expose React as a terminal external node.",
    );
    assert(
      mainGraph.nodes.some((node) => node.kind === "builtin" && node.moduleName === "node:fs"),
      "The graph should expose node:fs as a terminal built-in node.",
    );
    assert(
      mainGraph.edges.some((edge) => edge.resolutionKind === "unresolved" && edge.targetNodeId === null),
      "Unresolved graph edges should not fabricate target nodes.",
    );
    assert(
      mainGraph.edges.some((edge) => edge.specifier === aliasSpecifier && edge.bindings.length > 0),
      "Binding details should be opt-in and present when requested.",
    );
    assert(
      JSON.stringify(mainGraph) ===
        JSON.stringify(
          await graphService.getGraph(projectId, graphQuery({ depth: 2, includeBindings: true, path: mainPath })),
        ),
      "Repeated graph traversal should be deterministic.",
    );

    const cycleGraph = await graphService.getGraph(
      projectId,
      graphQuery({ depth: 5, direction: "both", path: "src/cycle-a.ts" }),
    );
    assert(
      cycleGraph.nodes.filter((node) => node.kind === "file" && node.path.includes("cycle-")).length === 2,
      "Cycle traversal should visit each cycle file once.",
    );
    const incomingGraph = await graphService.getGraph(
      projectId,
      graphQuery({ direction: "incoming", path: "src/cycle-a.ts" }),
    );
    assert(
      incomingGraph.edges.some((edge) => edge.sourcePath === "src/cycle-b.ts"),
      "Incoming traversal should include reverse dependants.",
    );

    countingReader.reset();
    countingExtractor.reset();
    const unchangedIndex = await dependencyService.index(projectId);
    assert(unchangedIndex.status === "completed", "An unchanged dependency index should complete.");
    assert(unchangedIndex.parsedFileCount === 0, "An unchanged run should parse zero code files.");
    assertCount(countingReader.codeReads, 0, "An unchanged run should read zero code files.");
    assertCount(countingExtractor.extractCalls, 0, "An unchanged run should invoke Tree-sitter zero times.");
    assert(
      equalEdgeIdentities(initialSnapshot, await getMainEdgeSnapshot(firstDatabase, projectId)),
      "Unchanged edges and bindings should retain stable UUIDs.",
    );

    await rm(join(temporaryRoot, "src", "core", "value.ts"));
    await inventoryService.scan(projectId);
    await sourceService.index(projectId);
    assert(
      await rejectsWithStaleGraph(graphService, projectId),
      "A newer source catalog should reject dependency graph traversal.",
    );
    countingReader.reset();
    countingExtractor.reset();
    await dependencyService.index(projectId);
    assertCount(countingExtractor.extractCalls, 0, "Target removal should not reparse unchanged code.");
    assert(!countingExtractor.parsedMain, "Target removal must not reparse the unchanged importer.");
    const removedTargetSnapshot = await getMainEdgeSnapshot(firstDatabase, projectId);
    const removedAlias = findEdge(removedTargetSnapshot, aliasSpecifier);
    assert(removedAlias?.resolutionKind === "unresolved", "Removing an alias target should invalidate resolution.");
    assertStableAliasIdentity(initialAlias, removedAlias, "target removal");

    await writeFile(join(temporaryRoot, "src", "core", "value.ts"), "export const coreValue = 2;\n");
    await inventoryService.scan(projectId);
    await sourceService.index(projectId);
    countingReader.reset();
    countingExtractor.reset();
    await dependencyService.index(projectId);
    assert(!countingExtractor.parsedMain, "Target addition must not reparse the unchanged importer.");
    const restoredTargetSnapshot = await getMainEdgeSnapshot(firstDatabase, projectId);
    const restoredAlias = findEdge(restoredTargetSnapshot, aliasSpecifier);
    assert(restoredAlias?.resolutionKind === "local", "Adding the target should restore local resolution.");
    assertStableAliasIdentity(initialAlias, restoredAlias, "target addition");

    await writeFile(join(temporaryRoot, "tsconfig.json"), tsconfig("src/alternate/*"));
    await inventoryService.scan(projectId);
    await sourceService.index(projectId);
    countingReader.reset();
    countingExtractor.reset();
    await dependencyService.index(projectId);
    assertCount(countingExtractor.extractCalls, 0, "Alias-only changes should perform zero Tree-sitter parses.");
    const changedAliasSnapshot = await getMainEdgeSnapshot(firstDatabase, projectId);
    const changedAlias = findEdge(changedAliasSnapshot, aliasSpecifier);
    assert(
      changedAlias?.targetRelativePath === "src/alternate/value.ts",
      "The changed alias should retarget the edge.",
    );
    assertStableAliasIdentity(initialAlias, changedAlias, "alias change");

    const edgeLimitedGraph = await graphService.getGraph(projectId, graphQuery({ maxEdges: 1, path: mainPath }));
    assert(edgeLimitedGraph.edges.length === 1, "Graph traversal must respect maxEdges.");
    assert(edgeLimitedGraph.truncated.edges, "Graph traversal should report edge truncation.");
    const nodeLimitedGraph = await graphService.getGraph(projectId, graphQuery({ maxNodes: 1, path: mainPath }));
    assert(nodeLimitedGraph.nodes.length === 1, "Graph traversal must respect maxNodes.");
    assert(nodeLimitedGraph.truncated.nodes, "Graph traversal should report node truncation.");

    const limitedService = new ProjectDependencyIndexService(
      projectRepository,
      inventoryRepository,
      sourceRepository,
      dependencyRepository,
      countingReader,
      countingExtractor,
      new TypeScriptProjectModuleResolver(),
      {
        ...config,
        projectDependency: {
          ...config.projectDependency,
          maxTotalEdges: 1,
        },
      },
    );
    const limitedIndex = await limitedService.index(projectId);
    assert(limitedIndex.status === "limited", "A one-edge budget should publish a limited graph.");
    assert(limitedIndex.limitReasons.includes("total_edges"), "The limited run should expose total_edges.");
    const restoredIndex = await dependencyService.index(projectId);
    assert(restoredIndex.status === "completed", "Normal limits should restore a complete graph.");

    const beforeRollback = await getMainEdgeSnapshot(firstDatabase, projectId);
    const currentSourceRun = await sourceRepository.getCurrentCatalogRun(projectId);
    const mainSourceFile = await firstDatabase.models.projectSourceFiles.findOne({
      where: { projectId, relativePath: mainPath },
    });
    assert(currentSourceRun !== null && mainSourceFile !== null, "Rollback verification requires current source rows.");
    assert(mainSourceFile.contentHash !== null && mainSourceFile.language !== null, "Main source must be ready.");
    const failedPublication = await dependencyRepository.beginIndex(projectId, currentSourceRun.id);
    let publicationRejected = false;
    try {
      await dependencyRepository.publishIndex({
        batchSize: config.projectDependency.batchSize,
        bindingCount: 0,
        builtinEdgeCount: 0,
        dependencyIndexId: failedPublication.id,
        edgeCount: 1,
        externalEdgeCount: 1,
        failedFileCount: 0,
        files: [
          {
            bindingCount: 0,
            dependencies: [
              {
                bindings: [],
                extractionKey: "e".repeat(64),
                kind: "static_import",
                range: range(),
                resolution: { kind: "external", packageName: "invalid-package" },
                specifier: "x".repeat(1_025),
                specifierRange: range(),
                typeOnly: false,
              },
            ],
            edgeCount: 1,
            errorCode: null,
            extractedAt: new Date().toISOString(),
            extractorIdentity: "acceptance-invalid-publication",
            hasSyntaxErrors: false,
            language: mainSourceFile.language,
            omittedBindingCount: 0,
            omittedEdgeCount: 0,
            relativePath: mainPath,
            sourceContentHash: mainSourceFile.contentHash,
            sourceFileId: mainSourceFile.id,
            status: "extracted",
          },
        ],
        limitReasons: [],
        localEdgeCount: 0,
        omittedBindingCount: 0,
        omittedEdgeCount: 0,
        parsedFileCount: 1,
        projectId,
        resolutionContextHash: "f".repeat(64),
        resolverWarnings: [],
        reusedFileCount: 0,
        sourceIndexRunId: currentSourceRun.id,
        unresolvedEdgeCount: 0,
        unsupportedFileCount: 0,
      });
    } catch {
      publicationRejected = true;
    }
    assert(publicationRejected, "PostgreSQL should reject an invalid atomic dependency publication.");
    await dependencyRepository.failIndex({
      dependencyIndexId: failedPublication.id,
      errorCode: "dependency_persistence_error",
      projectId,
    });
    assert(
      equalEdgeIdentities(beforeRollback, await getMainEdgeSnapshot(firstDatabase, projectId)),
      "A rolled-back publication must preserve the previous graph and UUIDs.",
    );
    assert(
      (await dependencyRepository.getCurrentCatalogRun(projectId))?.id === restoredIndex.id,
      "A failed publication must preserve the previous current dependency run.",
    );

    await assertDependencyPrivacy(firstDatabase, projectId, temporaryRoot);
    const abandonedIndex = await dependencyRepository.beginIndex(projectId, currentSourceRun.id);
    await firstDatabase.sequelize.close();
    firstDatabaseClosed = true;

    recoveryDatabase = createDatabase(config);
    await recoveryDatabase.sequelize.authenticate();
    const recoveryDependencyRepository = new SequelizeProjectDependencyIndexRepository(recoveryDatabase);
    const recoveredIndexCount = await recoveryDependencyRepository.recoverInterruptedIndexes();
    assert(recoveredIndexCount >= 1, "Restart recovery should fail at least one dependency index.");
    const recoveredRun = await recoveryDependencyRepository.getLatestRun(projectId);
    assert(recoveredRun?.id === abandonedIndex.id, "The abandoned dependency run should remain latest.");
    assert(recoveredRun.status === "failed", "The abandoned dependency run should become failed.");
    assert(recoveredRun.errorCode === "index_interrupted", "Recovery should expose index_interrupted.");
    assert(
      (await recoveryDependencyRepository.getCurrentCatalogRun(projectId))?.id === restoredIndex.id,
      "Recovery must preserve the prior complete graph.",
    );

    const recoveryGraphService = new ProjectDependencyGraphService(
      new SequelizeProjectRepository(recoveryDatabase),
      new SequelizeProjectSourceIndexRepository(recoveryDatabase),
      recoveryDependencyRepository,
      pathNormalizer,
      config,
    );
    assert(
      (await recoveryGraphService.getGraph(projectId, graphQuery({ path: mainPath }))).edges.length > 0,
      "The preserved graph should remain queryable after recovery.",
    );

    const result = {
      appliedMigrations,
      dependencyIndexId: restoredIndex.id,
      edgeCount: restoredIndex.edgeCount,
      recoveredIndexCount,
      stableAliasEdgeId: initialAlias.id,
    };
    await recoveryDatabase.models.projects.destroy({ where: { id: projectId } });
    await assertProjectCleanup(recoveryDatabase, projectId);
    projectId = undefined;
    return result;
  } finally {
    const cleanupDatabase = recoveryDatabase ?? firstDatabase;
    if (projectId !== undefined) {
      try {
        await cleanupDatabase.models.projects.destroy({ where: { id: projectId } });
      } catch {
        // Preserve the original verification error if cleanup cannot reach PostgreSQL.
      }
    }
    if (recoveryDatabase !== undefined) {
      await recoveryDatabase.sequelize.close();
    }
    if (!firstDatabaseClosed) {
      await firstDatabase.sequelize.close();
    }
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

class CountingSourceTextReader implements SourceTextReader {
  public codeReads = 0;

  public constructor(private readonly delegate: SourceTextReader) {}

  public inspect(input: Parameters<SourceTextReader["inspect"]>[0]) {
    if (/\.(?:cjs|js|jsx|mjs|ts|tsx)$/u.test(input.file.path)) {
      this.codeReads += 1;
    }
    return this.delegate.inspect(input);
  }

  public reset(): void {
    this.codeReads = 0;
  }
}

class CountingDependencyExtractor implements SourceDependencyExtractor {
  public extractCalls = 0;
  public parsedMain = false;

  public constructor(private readonly delegate: SourceDependencyExtractor) {}

  public extract(input: ExtractSourceDependenciesInput): SourceDependencyExtractionResult {
    this.extractCalls += 1;
    this.parsedMain ||= input.source.includes(privateBodyMarker);
    return this.delegate.extract(input);
  }

  public getExtractorIdentity(language: SourceDependencyLanguage): string {
    return this.delegate.getExtractorIdentity(language);
  }

  public supports(language: string): language is SourceDependencyLanguage {
    return this.delegate.supports(language);
  }

  public reset(): void {
    this.extractCalls = 0;
    this.parsedMain = false;
  }
}

async function createFixture(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "src", "alternate"), { recursive: true });
  await mkdir(join(rootPath, "src", "core"), { recursive: true });
  await writeFile(join(rootPath, "package.json"), '{"name":"arc-verify","type":"module"}\n');
  await writeFile(join(rootPath, "tsconfig.json"), tsconfig("src/core/*"));
  await writeFile(
    join(rootPath, mainPath),
    `import { coreValue } from "${aliasSpecifier}";
import { cycleA } from "./cycle-a.js";
import React from "react";
import { readFile } from "node:fs";
import missing from "./missing.js";
export { helper } from "./helper.js";
const lazy = import("./lazy.js");
const legacy = require("./legacy.cjs");
export const main = "${privateBodyMarker}" + coreValue + cycleA + React + readFile + missing + lazy + legacy;
`,
  );
  await writeFile(join(rootPath, "src", "core", "value.ts"), "export const coreValue = 1;\n");
  await writeFile(join(rootPath, "src", "alternate", "value.ts"), "export const coreValue = 3;\n");
  await writeFile(
    join(rootPath, "src", "cycle-a.ts"),
    'import { cycleB } from "./cycle-b.js";\nexport const cycleA = cycleB;\n',
  );
  await writeFile(
    join(rootPath, "src", "cycle-b.ts"),
    'import { cycleA } from "./cycle-a.js";\nexport const cycleB = cycleA;\n',
  );
  await writeFile(join(rootPath, "src", "helper.ts"), "export const helper = 1;\n");
  await writeFile(join(rootPath, "src", "lazy.ts"), "export const lazy = 1;\n");
  await writeFile(join(rootPath, "src", "legacy.cjs"), "module.exports = { legacy: 1 };\n");
  await writeFile(join(rootPath, "src", "view.tsx"), "export const View = () => <main>Arc</main>;\n");
  await writeFile(join(rootPath, "src", "widget.jsx"), "export const Widget = () => <aside>Arc</aside>;\n");
}

function tsconfig(aliasTarget: string): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        allowJs: true,
        baseUrl: ".",
        jsx: "react-jsx",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        paths: { "@core/*": [aliasTarget] },
      },
    },
    null,
    2,
  )}\n`;
}

async function getMainEdgeSnapshot(database: ArcDatabase, projectId: string): Promise<readonly EdgeSnapshot[]> {
  const file = await database.models.projectDependencyFiles.findOne({
    where: { projectId, relativePath: mainPath },
  });
  assert(file !== null, "The dependency catalog should contain src/main.ts.");
  const edges = await database.models.projectDependencyEdges.findAll({
    order: [
      ["startByte", "ASC"],
      ["id", "ASC"],
    ],
    where: { projectId, sourceFileId: file.sourceFileId },
  });
  const bindings = await database.models.projectDependencyBindings.findAll({
    order: [
      ["bindingKey", "ASC"],
      ["id", "ASC"],
    ],
    where: { projectId, sourceFileId: file.sourceFileId },
  });
  return edges.map((edge) => ({
    bindingIds: bindings.filter((binding) => binding.dependencyEdgeId === edge.id).map((binding) => binding.id),
    id: edge.id,
    resolutionKind: edge.resolutionKind,
    specifier: edge.specifier,
    targetRelativePath: edge.targetRelativePath,
  }));
}

function findEdge(edges: readonly EdgeSnapshot[], specifier: string): EdgeSnapshot | undefined {
  return edges.find((edge) => edge.specifier === specifier);
}

function equalEdgeIdentities(left: readonly EdgeSnapshot[], right: readonly EdgeSnapshot[]): boolean {
  return (
    left.length === right.length &&
    left.every((edge, index) => {
      const candidate = right[index];
      return (
        candidate?.id === edge.id &&
        candidate.specifier === edge.specifier &&
        candidate.bindingIds.join(",") === edge.bindingIds.join(",")
      );
    })
  );
}

function assertStableAliasIdentity(
  expected: EdgeSnapshot,
  actual: EdgeSnapshot | undefined,
  operation: string,
): asserts actual is EdgeSnapshot {
  assert(actual !== undefined, `The alias edge should survive ${operation}.`);
  assert(actual.id === expected.id, `The alias edge UUID should survive ${operation}.`);
  assert(
    actual.bindingIds.join(",") === expected.bindingIds.join(","),
    `The alias binding UUIDs should survive ${operation}.`,
  );
}

async function assertDialectCoverage(database: ArcDatabase, projectId: string): Promise<void> {
  const files = await database.models.projectDependencyFiles.findAll({ where: { projectId } });
  for (const path of [mainPath, "src/view.tsx", "src/widget.jsx", "src/legacy.cjs"]) {
    assert(
      files.some((file) => file.relativePath === path && file.status === "extracted"),
      `${path} should have a successful dependency extraction outcome.`,
    );
  }
}

async function rejectsWithStaleGraph(service: ProjectDependencyGraphService, projectId: string): Promise<boolean> {
  try {
    await service.getGraph(projectId, graphQuery({ path: mainPath }));
    return false;
  } catch (error) {
    return error instanceof ProjectDependencyCatalogStaleError;
  }
}

async function assertDependencyPrivacy(database: ArcDatabase, projectId: string, rootPath: string): Promise<void> {
  const [fileTable, edgeTable, bindingTable, files, edges, bindings] = await Promise.all([
    database.sequelize.getQueryInterface().describeTable("project_dependency_files"),
    database.sequelize.getQueryInterface().describeTable("project_dependency_edges"),
    database.sequelize.getQueryInterface().describeTable("project_dependency_bindings"),
    database.models.projectDependencyFiles.findAll({ where: { projectId } }),
    database.models.projectDependencyEdges.findAll({ where: { projectId } }),
    database.models.projectDependencyBindings.findAll({ where: { projectId } }),
  ]);
  const forbiddenColumns = [
    "content",
    "source_text",
    "body",
    "snippet",
    "syntax_tree",
    "ast",
    "absolute_path",
    "failed_lookup",
  ];
  assert(
    forbiddenColumns.every(
      (column) =>
        !Object.hasOwn(fileTable, column) && !Object.hasOwn(edgeTable, column) && !Object.hasOwn(bindingTable, column),
    ),
    "Dependency tables must not contain source bodies, syntax trees, or filesystem lookup columns.",
  );
  const persisted = JSON.stringify([
    ...files.map((file) => file.get({ plain: true })),
    ...edges.map((edge) => edge.get({ plain: true })),
    ...bindings.map((binding) => binding.get({ plain: true })),
  ]);
  assert(!persisted.includes(privateBodyMarker), "Source-body marker text must not enter dependency persistence.");
  assert(!persisted.includes(rootPath), "Absolute project paths must not enter dependency persistence.");
}

async function assertProjectCleanup(database: ArcDatabase, projectId: string): Promise<void> {
  const counts = await Promise.all([
    database.models.projects.count({ where: { id: projectId } }),
    database.models.projectFiles.count({ where: { projectId } }),
    database.models.projectSourceFiles.count({ where: { projectId } }),
    database.models.projectDependencyIndexRuns.count({ where: { projectId } }),
    database.models.projectDependencyFiles.count({ where: { projectId } }),
    database.models.projectDependencyEdges.count({ where: { projectId } }),
    database.models.projectDependencyBindings.count({ where: { projectId } }),
  ]);
  assert(
    counts.every((count) => count === 0),
    "Verification cleanup must remove all temporary dependency project rows.",
  );
}

function graphQuery(overrides: Partial<ProjectDependencyGraphQuery> = {}): ProjectDependencyGraphQuery {
  return {
    dependencyKind: [],
    depth: 1,
    direction: "outgoing",
    includeBindings: false,
    maxEdges: 500,
    maxNodes: 100,
    path: mainPath,
    resolutionKind: [],
    ...overrides,
  };
}

function range() {
  return {
    endByte: 1,
    endColumnByte: 1,
    endLine: 0,
    startByte: 0,
    startColumnByte: 0,
    startLine: 0,
  };
}

function assertCount(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("dependency-index-verify");
  logger.error("PostgreSQL project dependency-index verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
