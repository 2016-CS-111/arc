import "reflect-metadata";

import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createConsoleLogger } from "@arc/shared";

import { loadConfig } from "../config/env.js";
import { createDatabase } from "../database/database.sequelize.js";
import type { ArcDatabase } from "../database/database.types.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";
import { ProjectIgnorePolicyService } from "../modules/projects/application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "../modules/projects/application/project-inventory.service.js";
import { ProjectPathNormalizer } from "../modules/projects/application/project-path.normalizer.js";
import { ProjectSourceIndexService } from "../modules/projects/application/project-source-index.service.js";
import { SourceLanguageClassifier } from "../modules/projects/application/source-language.classifier.js";
import { NodeIgnoreRulesFileReader } from "../modules/projects/infrastructure/node-ignore-rules-file.reader.js";
import { NodeRepositoryInventoryWalker } from "../modules/projects/infrastructure/node-repository-inventory.walker.js";
import { NodeSourceTextReader } from "../modules/projects/infrastructure/node-source-text.reader.js";
import { SequelizeProjectInventoryRepository } from "../modules/projects/infrastructure/sequelize-project-inventory.repository.js";
import { SequelizeProjectRepository } from "../modules/projects/infrastructure/sequelize-project.repository.js";
import { SequelizeProjectSourceIndexRepository } from "../modules/projects/infrastructure/sequelize-project-source-index.repository.js";

interface SourceIndexVerificationResult {
  readonly appliedMigrations: readonly string[];
  readonly changedHash: string;
  readonly readyFileCount: number;
  readonly recoveredIndexCount: number;
  readonly sourceIndexId: string;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("source-index-verify");
  const config = loadConfig();
  const result = await verifySourceIndex();

  logger.info("PostgreSQL project source-index verification passed", {
    appliedMigrations: result.appliedMigrations,
    changedHash: result.changedHash,
    database: new URL(config.database.url).pathname,
    readyFileCount: result.readyFileCount,
    recoveredIndexCount: result.recoveredIndexCount,
    sourceIndexId: result.sourceIndexId,
  });
}

async function verifySourceIndex(): Promise<SourceIndexVerificationResult> {
  const config = loadConfig();
  const firstDatabase = createDatabase(config);
  let recoveryDatabase: ArcDatabase | undefined;
  let firstDatabaseClosed = false;
  let projectId: string | undefined;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arc-source-verify-"));

  try {
    const initialMainContent = "export const version = 1;\n";
    await createFixture(temporaryRoot, initialMainContent);
    await firstDatabase.sequelize.authenticate();
    const appliedMigrations = await runMigrations(firstDatabase.sequelize, await loadMigrations());
    const projectRepository = new SequelizeProjectRepository(firstDatabase);
    const registration = await projectRepository.register({
      name: "Arc source verification",
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
    const sourceReader = new NodeSourceTextReader();
    const sourceService = new ProjectSourceIndexService(
      projectRepository,
      inventoryRepository,
      sourceRepository,
      sourceReader,
      ignorePolicy,
      new SourceLanguageClassifier(),
      config,
    );

    const inventory = await inventoryService.scan(projectId);
    assert(inventory.status === "completed", "The verification inventory should complete.");
    assert(inventory.fileCount === 4, "The initial inventory should contain four regular files.");
    assert(inventory.skippedSymlinkCount === 1, "The inventory should skip the fixture symbolic link.");

    await writeFile(join(temporaryRoot, ".arcignore"), "README.md\n");
    const firstIndex = await sourceService.index(projectId);
    assert(firstIndex.status === "completed", "The first source index should complete.");
    assert(firstIndex.readyFileCount === 2, "Two UTF-8 files should be ready.");
    assert(firstIndex.skippedFileCount === 2, "Ignore re-evaluation and binary detection should skip two files.");

    const firstRows = await firstDatabase.models.projectSourceFiles.findAll({
      order: [["relativePath", "ASC"]],
      where: { projectId },
    });
    assert(firstRows.length === 4, "Every inventory path should have a source outcome.");
    const firstMain = firstRows.find((file) => file.relativePath === "src/main.ts");
    assert(firstMain?.status === "ready", "The TypeScript fixture should be ready.");
    assert(
      firstMain.contentHash === sha256(initialMainContent),
      "The source catalog should store the exact-byte SHA-256.",
    );
    assert(
      firstRows.find((file) => file.relativePath === "README.md")?.skipReason === "ignored_since_scan",
      "An ignore rule added after inventory must prevent the source read.",
    );
    assert(
      firstRows.find((file) => file.relativePath === "binary.dat")?.skipReason === "binary_content",
      "NUL-containing content must be rejected as binary.",
    );

    const table = await firstDatabase.sequelize.getQueryInterface().describeTable("project_source_files");
    assert(!Object.hasOwn(table, "content"), "The source catalog must not contain a source-text column.");

    const firstIds = new Map(firstRows.map((file) => [file.relativePath, file.id]));
    const unchangedIndex = await sourceService.index(projectId);
    assert(unchangedIndex.status === "completed", "An unchanged source reindex should complete.");
    const unchangedRows = await firstDatabase.models.projectSourceFiles.findAll({ where: { projectId } });
    assert(
      unchangedRows.every((file) => firstIds.get(file.relativePath) === file.id),
      "Unchanged source paths should retain stable UUIDs.",
    );

    const changedMainContent = "export const version = 200;\n";
    await writeFile(join(temporaryRoot, "src", "main.ts"), changedMainContent);
    const replacementInventory = await inventoryService.scan(projectId);
    assert(replacementInventory.status === "completed", "The replacement inventory should complete.");
    assert(
      replacementInventory.fileCount === 4,
      "The replacement inventory should replace ignored README.md with .arcignore.",
    );

    const staleStatus = await sourceService.getLatest(projectId);
    assert(staleStatus.currentCatalog?.stale === true, "A newer inventory should make the source catalog stale.");

    const changedIndex = await sourceService.index(projectId);
    const changedRows = await firstDatabase.models.projectSourceFiles.findAll({ where: { projectId } });
    const changedMain = changedRows.find((file) => file.relativePath === "src/main.ts");
    assert(changedMain?.contentHash === sha256(changedMainContent), "Changed source should receive a new hash.");
    assert(changedMain.id === firstMain.id, "A changed path should retain its stable source UUID.");
    assert(
      (await sourceService.getLatest(projectId)).currentCatalog?.stale === false,
      "A successful source reindex should restore freshness.",
    );

    const failedPublication = await sourceRepository.beginIndex(projectId, replacementInventory.id);
    let publicationRejected = false;
    try {
      await sourceRepository.completeIndex({
        batchSize: config.projectSource.batchSize,
        files: [
          {
            contentHash: "invalid-hash",
            inspectedBytes: changedMainContent.length,
            language: "typescript",
            modifiedAt: changedMain.modifiedAt.toISOString(),
            relativePath: changedMain.relativePath,
            sizeBytes: Number(changedMain.sizeBytes),
            skipReason: null,
            status: "ready",
          },
        ],
        inspectedBytes: changedMainContent.length,
        inventoryScanId: replacementInventory.id,
        limitReasons: [],
        projectId,
        readyBytes: changedMainContent.length,
        readyFileCount: 1,
        skippedFileCount: 0,
        sourceIndexId: failedPublication.id,
      });
    } catch {
      publicationRejected = true;
    }
    assert(publicationRejected, "PostgreSQL should reject an invalid atomic publication.");
    await sourceRepository.failIndex({
      errorCode: "source_persistence_error",
      projectId,
      sourceIndexId: failedPublication.id,
    });
    assert(
      await catalogBelongsTo(firstDatabase, projectId, changedIndex.id, 4),
      "A failed publication must preserve the previous complete catalog.",
    );

    const abandonedIndex = await sourceRepository.beginIndex(projectId, replacementInventory.id);
    await firstDatabase.sequelize.close();
    firstDatabaseClosed = true;

    recoveryDatabase = createDatabase(config);
    await recoveryDatabase.sequelize.authenticate();
    const recoveryRepository = new SequelizeProjectSourceIndexRepository(recoveryDatabase);
    const recoveredIndexCount = await recoveryRepository.recoverInterruptedIndexes();
    assert(recoveredIndexCount >= 1, "Restart recovery should fail at least one running source index.");
    const latestRun = await recoveryRepository.getLatestRun(projectId);
    assert(latestRun?.id === abandonedIndex.id, "The abandoned source index should remain the latest run.");
    assert(latestRun.status === "failed", "The abandoned source index should become failed.");
    assert(latestRun.errorCode === "index_interrupted", "Recovery should expose index_interrupted.");
    assert(
      await catalogBelongsTo(recoveryDatabase, projectId, changedIndex.id, 4),
      "Restart recovery must preserve the current source catalog.",
    );

    const linkedMetadata = await lstat(join(temporaryRoot, "linked-main.ts"));
    const linkedResult = await sourceReader.inspect({
      file: {
        modifiedAt: linkedMetadata.mtime.toISOString(),
        path: "linked-main.ts",
        sizeBytes: linkedMetadata.size,
      },
      maxFileBytes: config.projectSource.maxFileBytes,
      rootPath: temporaryRoot,
    });
    assert(
      linkedResult.status === "skipped" && linkedResult.skipReason === "symbolic_link",
      "The source reader must reject symbolic links independently.",
    );

    return {
      appliedMigrations,
      changedHash: changedMain.contentHash,
      readyFileCount: changedIndex.readyFileCount,
      recoveredIndexCount,
      sourceIndexId: changedIndex.id,
    };
  } finally {
    const cleanupDatabase = recoveryDatabase ?? firstDatabase;
    if (projectId !== undefined) {
      try {
        await cleanupDatabase.models.projects.destroy({ where: { id: projectId } });
      } catch {
        // Preserve the original verification failure if cleanup cannot reach PostgreSQL.
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

async function createFixture(rootPath: string, mainContent: string): Promise<void> {
  await mkdir(join(rootPath, "node_modules"));
  await mkdir(join(rootPath, "src"));
  await writeFile(join(rootPath, ".gitignore"), "*.tmp\n");
  await writeFile(join(rootPath, "README.md"), "Arc source verification\n");
  await writeFile(join(rootPath, "binary.dat"), Buffer.from([0x61, 0x00, 0x62]));
  await writeFile(join(rootPath, "ignored.tmp"), "ignored\n");
  await writeFile(join(rootPath, "node_modules", "dependency.js"), "ignored\n");
  await writeFile(join(rootPath, "src", "main.ts"), mainContent);
  await symlink(join(rootPath, "src", "main.ts"), join(rootPath, "linked-main.ts"));
}

async function catalogBelongsTo(
  database: ArcDatabase,
  projectId: string,
  sourceIndexRunId: string,
  expectedCount: number,
): Promise<boolean> {
  const rows = await database.models.projectSourceFiles.findAll({ where: { projectId } });
  return rows.length === expectedCount && rows.every((file) => file.sourceIndexRunId === sourceIndexRunId);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("source-index-verify");
  logger.error("PostgreSQL project source-index verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
