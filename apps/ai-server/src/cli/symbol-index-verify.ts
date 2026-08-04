import "reflect-metadata";

import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createConsoleLogger } from "@arc/shared";

import type { AppConfig } from "../config/env.js";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../database/database.sequelize.js";
import type { ArcDatabase } from "../database/database.types.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";
import { ProjectIgnorePolicyService } from "../modules/projects/application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "../modules/projects/application/project-inventory.service.js";
import { ProjectPathNormalizer } from "../modules/projects/application/project-path.normalizer.js";
import { ProjectSourceIndexService } from "../modules/projects/application/project-source-index.service.js";
import { ProjectSymbolIndexService } from "../modules/projects/application/project-symbol-index.service.js";
import { SourceLanguageClassifier } from "../modules/projects/application/source-language.classifier.js";
import type { SourceSymbolExtractor } from "../modules/projects/application/source-symbol.extractor.js";
import type { SourceTextReader } from "../modules/projects/application/source-text.reader.js";
import type {
  ExtractSourceSymbolsInput,
  SourceSymbolExtractionResult,
  SourceSymbolLanguage,
} from "../modules/projects/domain/project-symbol-index.types.js";
import { ProjectSourceCatalogStaleError } from "../modules/projects/domain/project.errors.js";
import { NodeIgnoreRulesFileReader } from "../modules/projects/infrastructure/node-ignore-rules-file.reader.js";
import { NodeRepositoryInventoryWalker } from "../modules/projects/infrastructure/node-repository-inventory.walker.js";
import { NodeSourceTextReader } from "../modules/projects/infrastructure/node-source-text.reader.js";
import { SequelizeProjectInventoryRepository } from "../modules/projects/infrastructure/sequelize-project-inventory.repository.js";
import { SequelizeProjectRepository } from "../modules/projects/infrastructure/sequelize-project.repository.js";
import { SequelizeProjectSourceIndexRepository } from "../modules/projects/infrastructure/sequelize-project-source-index.repository.js";
import { SequelizeProjectSymbolIndexRepository } from "../modules/projects/infrastructure/sequelize-project-symbol-index.repository.js";
import { TreeSitterSymbolExtractor } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-symbol.extractor.js";

const privateBodyMarker = "ARC_PRIVATE_BODY_MARKER_72C8";
const initialMainContent = `export const mainVersion = 1;
export class ArcService {
  public oldMethod(): string {
    return "${privateBodyMarker}";
  }
}
`;
const changedMainContent = `export const mainVersion = 2;
export class ArcService {
  public newMethod(): string {
    return "${privateBodyMarker}";
  }
}
`;
const initialUtilityContent = "export function sum(a: number, b: number) { return a + b; }\n";
const changedUtilityContent = "export function sub(a: number, b: number) { return a - b; }\n";

interface SymbolIndexVerificationResult {
  readonly appliedMigrations: readonly string[];
  readonly recoveredIndexCount: number;
  readonly stableSymbolId: string;
  readonly symbolCount: number;
  readonly symbolIndexId: string;
}

interface SymbolIdentitySnapshot {
  readonly id: string;
  readonly identityKey: string;
  readonly kind: string;
  readonly name: string;
  readonly path: string;
  readonly qualifiedName: string;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("symbol-index-verify");
  const config = loadConfig();
  const result = await verifySymbolIndex(config);

  logger.info("PostgreSQL project symbol-index verification passed", {
    appliedMigrations: result.appliedMigrations,
    database: new URL(config.database.url).pathname,
    recoveredIndexCount: result.recoveredIndexCount,
    stableSymbolId: result.stableSymbolId,
    symbolCount: result.symbolCount,
    symbolIndexId: result.symbolIndexId,
  });
}

async function verifySymbolIndex(config: AppConfig): Promise<SymbolIndexVerificationResult> {
  const firstDatabase = createDatabase(config);
  let recoveryDatabase: ArcDatabase | undefined;
  let firstDatabaseClosed = false;
  let projectId: string | undefined;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arc-symbol-verify-"));

  try {
    await createFixture(temporaryRoot);
    await firstDatabase.sequelize.authenticate();
    const appliedMigrations = await runMigrations(firstDatabase.sequelize, await loadMigrations());
    const projectRepository = new SequelizeProjectRepository(firstDatabase);
    const registration = await projectRepository.register({
      name: "Arc symbol verification",
      rootPath: await realpath(temporaryRoot),
    });
    projectId = registration.project.id;

    const inventoryRepository = new SequelizeProjectInventoryRepository(firstDatabase);
    const ignorePolicy = new ProjectIgnorePolicyService(
      projectRepository,
      new NodeIgnoreRulesFileReader(),
      new ProjectPathNormalizer(),
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
    const symbolRepository = new SequelizeProjectSymbolIndexRepository(firstDatabase);
    const countingReader = new CountingSourceTextReader(new NodeSourceTextReader());
    const countingExtractor = new CountingSourceSymbolExtractor(new TreeSitterSymbolExtractor());
    const symbolService = new ProjectSymbolIndexService(
      projectRepository,
      inventoryRepository,
      sourceRepository,
      symbolRepository,
      countingReader,
      countingExtractor,
      config,
    );

    const firstInventory = await inventoryService.scan(projectId);
    assert(firstInventory.status === "completed", "The symbol verification inventory should complete.");
    assert(firstInventory.fileCount === 4, "The fixture should contain four source-catalog files.");
    const firstSourceIndex = await sourceService.index(projectId);
    assert(firstSourceIndex.status === "completed", "The first source index should complete.");
    assert(firstSourceIndex.readyFileCount === 4, "Every fixture file should be valid bounded UTF-8.");

    const firstSymbolIndex = await symbolService.index(projectId);
    assert(firstSymbolIndex.status === "completed", "The first symbol index should complete.");
    assert(firstSymbolIndex.parsedFileCount === 3, "Three supported files should be parsed.");
    assert(firstSymbolIndex.unsupportedFileCount === 1, "Markdown should receive an unsupported outcome.");
    assert(firstSymbolIndex.failedFileCount === 0, "The first symbol index should have no failed files.");
    assert(firstSymbolIndex.symbolCount >= 6, "The fixture should produce representative declaration symbols.");
    assertCount(countingReader.inspectCalls, 3, "Only supported files should be read for initial parsing.");
    assertCount(countingExtractor.extractCalls, 3, "Only supported files should reach Tree-sitter.");

    const firstFiles = await firstDatabase.models.projectSymbolFiles.findAll({
      order: [["relativePath", "ASC"]],
      where: { projectId },
    });
    assert(firstFiles.length === 4, "Every ready source file should have a durable symbol-file outcome.");
    assert(
      firstFiles.find((file) => file.relativePath === "src/a-broken.ts")?.status === "parsed_with_errors",
      "Malformed TypeScript should retain valid symbols with explicit syntax-error state.",
    );
    assert(
      firstFiles.find((file) => file.relativePath === "README.md")?.status === "unsupported",
      "Unsupported Markdown should remain visible without entering the parser.",
    );
    await assertSourcePrivacy(firstDatabase, projectId);

    const firstSymbols = await getSymbolIdentitySnapshot(firstDatabase, projectId);
    const firstClass = findSymbol(firstSymbols, "src/main.ts", "class", "ArcService");
    const firstUtility = findSymbol(firstSymbols, "src/util.js", "function", "sum");
    assert(firstClass !== undefined, "The first catalog should contain ArcService.");
    assert(firstUtility !== undefined, "The first catalog should contain sum.");

    countingReader.reset();
    countingExtractor.reset();
    const unchangedIndex = await symbolService.index(projectId);
    assert(unchangedIndex.status === "completed", "An unchanged symbol index should complete.");
    assert(unchangedIndex.reusedFileCount === 4, "Every unchanged file outcome should be reused.");
    assert(unchangedIndex.parsedFileCount === 0, "An unchanged run should not parse files.");
    assertCount(countingReader.inspectCalls, 0, "Unchanged symbol reuse should not read source files.");
    assertCount(countingExtractor.extractCalls, 0, "Unchanged symbol reuse should not invoke Tree-sitter.");
    const unchangedSymbols = await getSymbolIdentitySnapshot(firstDatabase, projectId);
    assert(
      findSymbol(unchangedSymbols, "src/main.ts", "class", "ArcService")?.id === firstClass.id,
      "Unchanged class symbols should retain stable UUIDs.",
    );
    assert(
      findSymbol(unchangedSymbols, "src/util.js", "function", "sum")?.id === firstUtility.id,
      "Unchanged utility symbols should retain stable UUIDs.",
    );

    await writeFile(join(temporaryRoot, "src", "main.ts"), changedMainContent);
    const changedInventory = await inventoryService.scan(projectId);
    assert(changedInventory.status === "completed", "The changed inventory should complete.");
    assert(
      await rejectsWithStaleCatalog(symbolService, projectId),
      "Symbol indexing should reject a stale source catalog before creating a run.",
    );
    await sourceService.index(projectId);
    assert(
      (await symbolService.getLatest(projectId)).currentCatalog?.stale === true,
      "A newer source index should make the symbol catalog stale.",
    );

    countingReader.reset();
    countingExtractor.reset();
    const changedSymbolIndex = await symbolService.index(projectId);
    assert(changedSymbolIndex.status === "completed", "Changed-file symbol indexing should complete.");
    assert(changedSymbolIndex.parsedFileCount === 1, "Only the changed TypeScript file should be parsed.");
    assert(changedSymbolIndex.reusedFileCount === 3, "Three unchanged file outcomes should be reused.");
    assertCount(countingReader.inspectCalls, 1, "Only the changed file should be re-read.");
    assertCount(countingExtractor.extractCalls, 1, "Only the changed file should be reparsed.");
    const changedSymbols = await getSymbolIdentitySnapshot(firstDatabase, projectId);
    assert(
      findSymbol(changedSymbols, "src/main.ts", "class", "ArcService")?.id === firstClass.id,
      "A stable class identity should survive unrelated body and member changes.",
    );
    assert(
      findSymbol(changedSymbols, "src/main.ts", "method", "ArcService.oldMethod") === undefined,
      "Removed declarations must not survive atomic replacement.",
    );
    assert(
      findSymbol(changedSymbols, "src/main.ts", "method", "ArcService.newMethod") !== undefined,
      "New declarations should enter the replacement catalog.",
    );
    assert(
      findSymbol(changedSymbols, "src/util.js", "function", "sum")?.id === firstUtility.id,
      "Unchanged-file symbol UUIDs should survive another file's replacement.",
    );

    const utilitySourceFile = await firstDatabase.models.projectSourceFiles.findOne({
      where: { projectId, relativePath: "src/util.js" },
    });
    assert(utilitySourceFile !== null, "The utility source fingerprint should exist.");
    assert(
      Buffer.byteLength(initialUtilityContent) === Buffer.byteLength(changedUtilityContent),
      "The source-change fixture must preserve byte size.",
    );
    await writeFile(join(temporaryRoot, "src", "util.js"), changedUtilityContent);
    await utimes(join(temporaryRoot, "src", "util.js"), utilitySourceFile.modifiedAt, utilitySourceFile.modifiedAt);
    countingExtractor.setIdentityRevision("acceptance-revision@2");
    countingReader.reset();
    countingExtractor.reset();
    const driftedSymbolIndex = await symbolService.index(projectId);
    assert(driftedSymbolIndex.failedFileCount === 1, "A post-fingerprint mutation should fail one file.");
    assertCount(countingReader.inspectCalls, 3, "A parser revision should invalidate every supported file.");
    assertCount(countingExtractor.extractCalls, 2, "Hash-mismatched source must not reach Tree-sitter.");
    const driftedUtility = await firstDatabase.models.projectSymbolFiles.findOne({
      where: { projectId, relativePath: "src/util.js" },
    });
    assert(
      driftedUtility?.status === "failed" && driftedUtility.errorCode === "source_changed",
      "Same-metadata source drift should receive a durable source_changed outcome.",
    );
    assert(
      (await getSymbolIdentitySnapshot(firstDatabase, projectId)).every((symbol) => symbol.path !== "src/util.js"),
      "A failed changed file must not retain stale symbols.",
    );

    const driftInventory = await inventoryService.scan(projectId);
    assert(driftInventory.status === "completed", "The drift replacement inventory should complete.");
    const driftSourceIndex = await sourceService.index(projectId);
    countingReader.reset();
    countingExtractor.reset();
    const driftRecoveryIndex = await symbolService.index(projectId);
    assert(driftRecoveryIndex.status === "completed", "A newly fingerprinted drifted source should parse.");
    assert(driftRecoveryIndex.parsedFileCount === 1, "Only the previously failed file should require parsing.");
    assert(driftRecoveryIndex.reusedFileCount === 3, "Successful revision-two outcomes should remain reusable.");
    assertCount(countingReader.inspectCalls, 1, "Drift recovery should read only the failed file.");
    assertCount(countingExtractor.extractCalls, 1, "Drift recovery should parse only the failed file.");
    assert(
      findSymbol(await getSymbolIdentitySnapshot(firstDatabase, projectId), "src/util.js", "function", "sub") !==
        undefined,
      "The newly fingerprinted utility declaration should be published.",
    );

    const limitedConfig: AppConfig = {
      ...config,
      projectSymbol: {
        ...config.projectSymbol,
        maxTotalSymbols: 1,
      },
    };
    const limitedService = new ProjectSymbolIndexService(
      projectRepository,
      inventoryRepository,
      sourceRepository,
      symbolRepository,
      countingReader,
      countingExtractor,
      limitedConfig,
    );
    countingReader.reset();
    countingExtractor.reset();
    const limitedIndex = await limitedService.index(projectId);
    assert(limitedIndex.status === "limited", "The one-symbol run budget should produce a limited catalog.");
    assert(limitedIndex.limitReasons.includes("total_symbols"), "The run should expose total_symbols.");
    assert(limitedIndex.symbolCount === 1, "The limited catalog must respect the configured total.");
    assert(limitedIndex.omittedSymbolCount >= 1, "The limited catalog should report omitted symbols.");

    countingReader.reset();
    countingExtractor.reset();
    const restoredIndex = await symbolService.index(projectId);
    assert(restoredIndex.status === "completed", "Restoring normal limits should republish a complete catalog.");
    assert(restoredIndex.symbolCount >= 6, "The restored catalog should contain all representative symbols.");
    assert(
      countingExtractor.extractCalls >= 1,
      "Files with limited outcomes must be reparsed instead of reused as complete.",
    );
    await assertSourcePrivacy(firstDatabase, projectId);

    const beforeRollbackSymbols = await getSymbolIdentitySnapshot(firstDatabase, projectId);
    const mainSourceFile = await firstDatabase.models.projectSourceFiles.findOne({
      where: { projectId, relativePath: "src/main.ts" },
    });
    assert(mainSourceFile !== null, "The main source fingerprint should exist.");
    assert(mainSourceFile.contentHash !== null && mainSourceFile.language !== null, "Main source must be ready.");
    const failedPublication = await symbolRepository.beginIndex(projectId, driftSourceIndex.id);
    let publicationRejected = false;
    try {
      await symbolRepository.publishIndex({
        batchSize: config.projectSymbol.batchSize,
        failedFileCount: 0,
        files: [
          {
            errorCode: null,
            hasSyntaxErrors: false,
            language: mainSourceFile.language,
            omittedSymbolCount: 0,
            parserIdentity: "acceptance-invalid-publication",
            relativePath: mainSourceFile.relativePath,
            sourceContentHash: mainSourceFile.contentHash,
            sourceFileId: mainSourceFile.id,
            status: "parsed",
            symbolCount: 1,
            symbols: [
              {
                exported: true,
                identityKey: "f".repeat(64),
                kind: "class",
                name: "x".repeat(513),
                parentIdentityKey: null,
                qualifiedName: "x".repeat(513),
                range: {
                  endByte: 1,
                  endColumnByte: 1,
                  endLine: 0,
                  startByte: 0,
                  startColumnByte: 0,
                  startLine: 0,
                },
              },
            ],
          },
        ],
        limitReasons: [],
        omittedSymbolCount: 0,
        parsedFileCount: 1,
        projectId,
        reusedFileCount: 0,
        reusedSourceFileIds: [],
        sourceIndexRunId: driftSourceIndex.id,
        symbolCount: 1,
        symbolIndexId: failedPublication.id,
        unsupportedFileCount: 0,
      });
    } catch {
      publicationRejected = true;
    }
    assert(publicationRejected, "PostgreSQL should reject an invalid symbol publication.");
    await symbolRepository.failIndex({
      errorCode: "symbol_persistence_error",
      projectId,
      symbolIndexId: failedPublication.id,
    });
    assert(
      await catalogBelongsTo(firstDatabase, projectId, restoredIndex.id, 4, restoredIndex.symbolCount),
      "A rolled-back publication must preserve the previous symbol catalog.",
    );
    assert(
      equalSymbolIdentitySnapshots(beforeRollbackSymbols, await getSymbolIdentitySnapshot(firstDatabase, projectId)),
      "A rolled-back publication must preserve stable symbol UUIDs.",
    );

    const abandonedIndex = await symbolRepository.beginIndex(projectId, driftSourceIndex.id);
    await firstDatabase.sequelize.close();
    firstDatabaseClosed = true;

    recoveryDatabase = createDatabase(config);
    await recoveryDatabase.sequelize.authenticate();
    const recoveryRepository = new SequelizeProjectSymbolIndexRepository(recoveryDatabase);
    const recoveredIndexCount = await recoveryRepository.recoverInterruptedIndexes();
    assert(recoveredIndexCount >= 1, "Restart recovery should fail at least one running symbol index.");
    const recoveredRun = await recoveryRepository.getLatestRun(projectId);
    assert(recoveredRun?.id === abandonedIndex.id, "The abandoned symbol index should remain the latest run.");
    assert(recoveredRun.status === "failed", "The abandoned symbol index should become failed.");
    assert(recoveredRun.errorCode === "index_interrupted", "Recovery should expose index_interrupted.");
    assert(
      await catalogBelongsTo(recoveryDatabase, projectId, restoredIndex.id, 4, restoredIndex.symbolCount),
      "Restart recovery must preserve the previous complete symbol catalog.",
    );

    const result = {
      appliedMigrations,
      recoveredIndexCount,
      stableSymbolId: firstClass.id,
      symbolCount: restoredIndex.symbolCount,
      symbolIndexId: restoredIndex.id,
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
  public inspectCalls = 0;

  public constructor(private readonly delegate: SourceTextReader) {}

  public inspect(input: Parameters<SourceTextReader["inspect"]>[0]) {
    this.inspectCalls += 1;
    return this.delegate.inspect(input);
  }

  public reset(): void {
    this.inspectCalls = 0;
  }
}

class CountingSourceSymbolExtractor implements SourceSymbolExtractor {
  public extractCalls = 0;
  private identityRevision = "acceptance-revision@1";

  public constructor(private readonly delegate: SourceSymbolExtractor) {}

  public extract(input: ExtractSourceSymbolsInput): SourceSymbolExtractionResult {
    this.extractCalls += 1;
    return this.delegate.extract(input);
  }

  public getParserIdentity(language: SourceSymbolLanguage): string {
    return `${this.delegate.getParserIdentity(language)}/${this.identityRevision}`;
  }

  public supports(language: string): language is SourceSymbolLanguage {
    return this.delegate.supports(language);
  }

  public reset(): void {
    this.extractCalls = 0;
  }

  public setIdentityRevision(revision: string): void {
    this.identityRevision = revision;
  }
}

async function createFixture(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "src"));
  await writeFile(join(rootPath, "README.md"), "# Arc symbol verification\n");
  await writeFile(
    join(rootPath, "src", "a-broken.ts"),
    "export const before = 1;\nexport class Broken {}\nconst = ;\n",
  );
  await writeFile(join(rootPath, "src", "main.ts"), initialMainContent);
  await writeFile(join(rootPath, "src", "util.js"), initialUtilityContent);
}

async function rejectsWithStaleCatalog(service: ProjectSymbolIndexService, projectId: string): Promise<boolean> {
  try {
    await service.index(projectId);
    return false;
  } catch (error) {
    return error instanceof ProjectSourceCatalogStaleError;
  }
}

async function getSymbolIdentitySnapshot(
  database: ArcDatabase,
  projectId: string,
): Promise<readonly SymbolIdentitySnapshot[]> {
  const [files, symbols] = await Promise.all([
    database.models.projectSymbolFiles.findAll({ where: { projectId } }),
    database.models.projectSymbols.findAll({
      order: [
        ["sourceFileId", "ASC"],
        ["startByte", "ASC"],
        ["id", "ASC"],
      ],
      where: { projectId },
    }),
  ]);
  const paths = new Map(files.map((file) => [file.sourceFileId, file.relativePath]));
  return symbols.map((symbol) => ({
    id: symbol.id,
    identityKey: symbol.identityKey,
    kind: symbol.kind,
    name: symbol.name,
    path: paths.get(symbol.sourceFileId) ?? "unknown",
    qualifiedName: symbol.qualifiedName,
  }));
}

function findSymbol(
  symbols: readonly SymbolIdentitySnapshot[],
  path: string,
  kind: string,
  qualifiedName: string,
): SymbolIdentitySnapshot | undefined {
  return symbols.find(
    (symbol) => symbol.path === path && symbol.kind === kind && symbol.qualifiedName === qualifiedName,
  );
}

function equalSymbolIdentitySnapshots(
  left: readonly SymbolIdentitySnapshot[],
  right: readonly SymbolIdentitySnapshot[],
): boolean {
  return (
    left.length === right.length &&
    left.every((symbol, index) => {
      const candidate = right[index];
      return (
        candidate?.id === symbol.id && candidate.identityKey === symbol.identityKey && candidate.path === symbol.path
      );
    })
  );
}

async function assertSourcePrivacy(database: ArcDatabase, projectId: string): Promise<void> {
  const [fileTable, symbolTable, files, symbols] = await Promise.all([
    database.sequelize.getQueryInterface().describeTable("project_symbol_files"),
    database.sequelize.getQueryInterface().describeTable("project_symbols"),
    database.models.projectSymbolFiles.findAll({ where: { projectId } }),
    database.models.projectSymbols.findAll({ where: { projectId } }),
  ]);
  const forbiddenColumns = ["content", "source_text", "body", "signature", "snippet", "syntax_tree", "ast"];
  assert(
    forbiddenColumns.every((column) => !Object.hasOwn(fileTable, column) && !Object.hasOwn(symbolTable, column)),
    "Symbol tables must not contain source-body or syntax-tree columns.",
  );
  const persistedRows = JSON.stringify([
    ...files.map((file) => file.get({ plain: true })),
    ...symbols.map((symbol) => symbol.get({ plain: true })),
  ]);
  assert(!persistedRows.includes(privateBodyMarker), "Source-body marker text must not enter symbol persistence.");
}

async function catalogBelongsTo(
  database: ArcDatabase,
  projectId: string,
  symbolIndexRunId: string,
  expectedFileCount: number,
  expectedSymbolCount: number,
): Promise<boolean> {
  const [files, symbols] = await Promise.all([
    database.models.projectSymbolFiles.findAll({ where: { projectId } }),
    database.models.projectSymbols.findAll({ where: { projectId } }),
  ]);
  return (
    files.length === expectedFileCount &&
    symbols.length === expectedSymbolCount &&
    files.every((file) => file.symbolIndexRunId === symbolIndexRunId) &&
    symbols.every((symbol) => symbol.symbolIndexRunId === symbolIndexRunId)
  );
}

async function assertProjectCleanup(database: ArcDatabase, projectId: string): Promise<void> {
  const counts = await Promise.all([
    database.models.projects.count({ where: { id: projectId } }),
    database.models.projectFiles.count({ where: { projectId } }),
    database.models.projectSourceFiles.count({ where: { projectId } }),
    database.models.projectSymbolFiles.count({ where: { projectId } }),
    database.models.projectSymbols.count({ where: { projectId } }),
  ]);
  assert(
    counts.every((count) => count === 0),
    "Verification cleanup must remove all temporary project rows.",
  );
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertCount(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("symbol-index-verify");
  logger.error("PostgreSQL project symbol-index verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
