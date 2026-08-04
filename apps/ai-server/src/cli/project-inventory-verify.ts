import "reflect-metadata";

import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
import { NodeIgnoreRulesFileReader } from "../modules/projects/infrastructure/node-ignore-rules-file.reader.js";
import { NodeRepositoryInventoryWalker } from "../modules/projects/infrastructure/node-repository-inventory.walker.js";
import { SequelizeProjectInventoryRepository } from "../modules/projects/infrastructure/sequelize-project-inventory.repository.js";
import { SequelizeProjectRepository } from "../modules/projects/infrastructure/sequelize-project.repository.js";

interface ProjectInventoryVerificationResult {
  readonly appliedMigrations: readonly string[];
  readonly fileCount: number;
  readonly recoveredScanCount: number;
  readonly scanId: string;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("project-inventory-verify");
  const config = loadConfig();
  const result = await verifyProjectInventory();

  logger.info("PostgreSQL project inventory verification passed", {
    appliedMigrations: result.appliedMigrations,
    database: new URL(config.database.url).pathname,
    fileCount: result.fileCount,
    recoveredScanCount: result.recoveredScanCount,
    scanId: result.scanId,
  });
}

async function verifyProjectInventory(): Promise<ProjectInventoryVerificationResult> {
  const config = loadConfig();
  const firstDatabase = createDatabase(config);
  let recoveryDatabase: ArcDatabase | undefined;
  let firstDatabaseClosed = false;
  let projectId: string | undefined;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arc-project-verify-"));

  try {
    await createFixture(temporaryRoot);
    await firstDatabase.sequelize.authenticate();
    const appliedMigrations = await runMigrations(firstDatabase.sequelize, await loadMigrations());
    const projectRepository = new SequelizeProjectRepository(firstDatabase);
    const registration = await projectRepository.register({
      name: "Arc inventory verification",
      rootPath: await realpath(temporaryRoot),
    });
    projectId = registration.project.id;

    const inventoryRepository = new SequelizeProjectInventoryRepository(firstDatabase);
    const inventoryService = new ProjectInventoryService(
      projectRepository,
      inventoryRepository,
      new NodeRepositoryInventoryWalker(),
      new ProjectIgnorePolicyService(projectRepository, new NodeIgnoreRulesFileReader(), new ProjectPathNormalizer()),
      config,
    );

    const firstScan = await inventoryService.scan(projectId);
    assert(firstScan.status === "completed", "The first project inventory should complete.");
    assert(firstScan.fileCount === 3, "The first inventory should contain three metadata rows.");
    assert(firstScan.skippedSymlinkCount === 1, "The inventory should skip one symbolic link.");

    await writeFile(join(temporaryRoot, "src", "second.ts"), "export const second = true;\n");
    const secondScan = await inventoryService.scan(projectId);
    assert(secondScan.status === "completed", "The second project inventory should complete.");
    assert(secondScan.fileCount === 4, "The replacement inventory should contain four metadata rows.");

    const currentFiles = await firstDatabase.models.projectFiles.findAll({
      order: [["relativePath", "ASC"]],
      where: { projectId },
    });
    assert(currentFiles.length === 4, "PostgreSQL should contain only the current inventory.");
    assert(
      currentFiles.every((file) => file.scanId === secondScan.id),
      "Every current file should belong to the replacement scan.",
    );
    assert(
      currentFiles.every(
        (file) =>
          !file.relativePath.includes("node_modules") &&
          file.relativePath !== "ignored.tmp" &&
          file.relativePath !== "linked-src",
      ),
      "Ignored paths and symbolic links must not enter the inventory.",
    );

    await inventoryRepository.beginScan(projectId);
    await firstDatabase.sequelize.close();
    firstDatabaseClosed = true;

    recoveryDatabase = createDatabase(config);
    await recoveryDatabase.sequelize.authenticate();
    const recoveryRepository = new SequelizeProjectInventoryRepository(recoveryDatabase);
    const recoveredScanCount = await recoveryRepository.recoverInterruptedScans();
    assert(recoveredScanCount >= 1, "Restart recovery should fail at least one running scan.");
    const recoveredScan = await recoveryRepository.getLatestScan(projectId);
    assert(recoveredScan?.status === "failed", "The abandoned scan should become failed.");
    assert(
      recoveredScan.errorCode === "scan_interrupted",
      "The recovered scan should expose the scan_interrupted error code.",
    );

    const preservedFileCount = await recoveryDatabase.models.projectFiles.count({ where: { projectId } });
    assert(preservedFileCount === 4, "Restart recovery must preserve the last usable inventory.");

    return {
      appliedMigrations,
      fileCount: secondScan.fileCount,
      recoveredScanCount,
      scanId: secondScan.id,
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

async function createFixture(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "node_modules"));
  await mkdir(join(rootPath, "src"));
  await writeFile(join(rootPath, ".gitignore"), "*.tmp\n");
  await writeFile(join(rootPath, "README.md"), "Arc inventory verification\n");
  await writeFile(join(rootPath, "ignored.tmp"), "ignored\n");
  await writeFile(join(rootPath, "node_modules", "dependency.js"), "ignored\n");
  await writeFile(join(rootPath, "src", "main.ts"), "export const main = true;\n");
  await symlink(join(rootPath, "src"), join(rootPath, "linked-src"));
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("project-inventory-verify");
  logger.error("PostgreSQL project inventory verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
