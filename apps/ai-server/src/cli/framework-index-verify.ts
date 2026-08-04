import "reflect-metadata";

import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProjectFrameworkCatalogQuery } from "@arc/contracts";
import { createConsoleLogger } from "@arc/shared";

import type { AppConfig } from "../config/env.js";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../database/database.sequelize.js";
import type { ArcDatabase } from "../database/database.types.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";
import { ProjectDependencyIndexService } from "../modules/projects/application/project-dependency-index.service.js";
import { ProjectFrameworkCatalogService } from "../modules/projects/application/project-framework-catalog.service.js";
import { ProjectFrameworkIndexService } from "../modules/projects/application/project-framework-index.service.js";
import { ProjectIgnorePolicyService } from "../modules/projects/application/project-ignore-policy.service.js";
import { ProjectInventoryService } from "../modules/projects/application/project-inventory.service.js";
import { ProjectPathNormalizer } from "../modules/projects/application/project-path.normalizer.js";
import { ProjectSourceIndexService } from "../modules/projects/application/project-source-index.service.js";
import { ProjectSymbolIndexService } from "../modules/projects/application/project-symbol-index.service.js";
import { SourceLanguageClassifier } from "../modules/projects/application/source-language.classifier.js";
import type { SourceTextReader } from "../modules/projects/application/source-text.reader.js";
import {
  ProjectFrameworkCatalogStaleError,
  ProjectFrameworkIndexFailedError,
} from "../modules/projects/domain/project.errors.js";
import { NodeIgnoreRulesFileReader } from "../modules/projects/infrastructure/node-ignore-rules-file.reader.js";
import { NodeRepositoryInventoryWalker } from "../modules/projects/infrastructure/node-repository-inventory.walker.js";
import { NodeSourceTextReader } from "../modules/projects/infrastructure/node-source-text.reader.js";
import { SequelizeProjectDependencyIndexRepository } from "../modules/projects/infrastructure/sequelize-project-dependency-index.repository.js";
import { SequelizeProjectFrameworkIndexRepository } from "../modules/projects/infrastructure/sequelize-project-framework-index.repository.js";
import { SequelizeProjectInventoryRepository } from "../modules/projects/infrastructure/sequelize-project-inventory.repository.js";
import { SequelizeProjectRepository } from "../modules/projects/infrastructure/sequelize-project.repository.js";
import { SequelizeProjectSourceIndexRepository } from "../modules/projects/infrastructure/sequelize-project-source-index.repository.js";
import { SequelizeProjectSymbolIndexRepository } from "../modules/projects/infrastructure/sequelize-project-symbol-index.repository.js";
import { TreeSitterDependencyExtractor } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-dependency.extractor.js";
import { TreeSitterSymbolExtractor } from "../modules/projects/infrastructure/tree-sitter/tree-sitter-symbol.extractor.js";
import { TypeScriptProjectModuleResolver } from "../modules/projects/infrastructure/typescript/typescript-project-module.resolver.js";

const privateBodyMarker = "ARC_PRIVATE_FRAMEWORK_BODY_5C91";
const expressPath = "packages/api/src/server.js";
const sequelizePath = "packages/db/src/models.js";

interface FrameworkVerificationResult {
  readonly appliedMigrations: readonly string[];
  readonly entityCount: number;
  readonly frameworkIndexId: string;
  readonly recoveredIndexCount: number;
  readonly relationshipCount: number;
  readonly reusedFileCount: number;
}

interface FrameworkServices {
  readonly catalogService: ProjectFrameworkCatalogService;
  readonly dependencyService: ProjectDependencyIndexService;
  readonly frameworkRepository: SequelizeProjectFrameworkIndexRepository;
  readonly frameworkService: ProjectFrameworkIndexService;
  readonly inventoryService: ProjectInventoryService;
  readonly sourceRepository: SequelizeProjectSourceIndexRepository;
  readonly sourceService: ProjectSourceIndexService;
  readonly symbolService: ProjectSymbolIndexService;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("framework-index-verify");
  const config = loadConfig();
  const result = await verifyFrameworkIndex(config);
  logger.info("PostgreSQL project framework-index verification passed", {
    appliedMigrations: result.appliedMigrations,
    database: new URL(config.database.url).pathname,
    entityCount: result.entityCount,
    frameworkIndexId: result.frameworkIndexId,
    recoveredIndexCount: result.recoveredIndexCount,
    relationshipCount: result.relationshipCount,
    reusedFileCount: result.reusedFileCount,
  });
}

async function verifyFrameworkIndex(config: AppConfig): Promise<FrameworkVerificationResult> {
  const firstDatabase = createDatabase(config);
  let recoveryDatabase: ArcDatabase | undefined;
  let firstDatabaseClosed = false;
  let projectId: string | undefined;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arc-framework-verify-"));

  try {
    await createFixture(temporaryRoot);
    await firstDatabase.sequelize.authenticate();
    const appliedMigrations = await runMigrations(firstDatabase.sequelize, await loadMigrations());
    const projectRepository = new SequelizeProjectRepository(firstDatabase);
    const registration = await projectRepository.register({
      name: "Arc framework verification",
      rootPath: await realpath(temporaryRoot),
    });
    projectId = registration.project.id;
    const countingReader = new CountingSourceTextReader(new NodeSourceTextReader());
    const services = createServices(firstDatabase, config, countingReader);

    assert((await services.inventoryService.scan(projectId)).status === "completed", "Inventory should complete.");
    assert((await services.sourceService.index(projectId)).status === "completed", "Source indexing should complete.");
    assert((await services.symbolService.index(projectId)).status === "completed", "Symbol indexing should complete.");
    assert(
      (await services.dependencyService.index(projectId)).status === "completed",
      "Dependency indexing should complete.",
    );
    const initialIndex = await services.frameworkService.index(projectId);
    assert(
      initialIndex.status === "completed" || initialIndex.status === "limited",
      "The initial framework index should publish.",
    );
    const initialCatalog = await services.catalogService.getCatalog(projectId, catalogQuery());
    assertFrameworkCoverage(initialCatalog);
    assert(
      JSON.stringify(initialCatalog) ===
        JSON.stringify(await services.catalogService.getCatalog(projectId, catalogQuery())),
      "Repeated framework catalog queries should be deterministic.",
    );
    const limitedCatalog = await services.catalogService.getCatalog(
      projectId,
      catalogQuery({ maxEntities: 1, maxRelationships: 1 }),
    );
    assert(limitedCatalog.entities.length === 1, "Catalog queries must respect maxEntities.");
    assert(limitedCatalog.truncated.entities, "Catalog queries should expose entity truncation.");
    const initialEntityIds = new Map(initialCatalog.entities.map((entity) => [entity.identityKey, entity.id]));

    await services.symbolService.index(projectId);
    await services.dependencyService.index(projectId);
    countingReader.reset();
    const reusedIndex = await services.frameworkService.index(projectId);
    assert(reusedIndex.reusedFileCount > 0, "An unchanged framework run should reuse normalized evidence.");
    assert(reusedIndex.analyzedFileCount === 0, "An unchanged framework run should analyze zero code files.");
    assert(countingReader.codeReads === 0, "An unchanged framework run should read zero code files.");
    const reusedCatalog = await services.catalogService.getCatalog(projectId, catalogQuery());
    assertStableEntityIds(initialEntityIds, reusedCatalog.entities, "unchanged relinking");

    await writeFile(
      join(temporaryRoot, expressPath),
      `import express from "express";
// ${privateBodyMarker}
export const app = express();
app.get("/ready", (_request, response) => response.send("ready"));
`,
    );
    await services.inventoryService.scan(projectId);
    await services.sourceService.index(projectId);
    assert(
      await rejectsWithStaleCatalog(services.catalogService, projectId),
      "A newer source catalog should make the framework catalog stale.",
    );
    await services.symbolService.index(projectId);
    await services.dependencyService.index(projectId);
    countingReader.reset();
    const changedIndex = await services.frameworkService.index(projectId);
    assert(changedIndex.analyzedFileCount > 0, "A changed framework file should be analyzed.");
    assert(countingReader.hasCodeReads(), "A changed framework file should be read.");
    const changedCatalog = await services.catalogService.getCatalog(projectId, catalogQuery());
    assert(
      changedCatalog.entities.some(
        (entity) =>
          entity.framework === "express" &&
          entity.entityKind === "route" &&
          entity.attributes.kind === "express_route" &&
          entity.attributes.paths.includes("/ready"),
      ),
      "Changed Express route facts should replace the prior route.",
    );
    assertStableUnrelatedEntityIds(initialEntityIds, changedCatalog.entities, expressPath);

    await rm(join(temporaryRoot, sequelizePath));
    await services.inventoryService.scan(projectId);
    await services.sourceService.index(projectId);
    await services.symbolService.index(projectId);
    await services.dependencyService.index(projectId);
    await services.frameworkService.index(projectId);
    const cleanedCatalog = await services.catalogService.getCatalog(
      projectId,
      catalogQuery({ framework: ["sequelize"] }),
    );
    assert(cleanedCatalog.entities.length === 0, "Removed Sequelize files should remove stale model facts.");

    const beforeRollback = await services.catalogService.getCatalog(projectId, catalogQuery());
    await assertAtomicRollback(firstDatabase, services, projectId);
    const afterRollback = await services.catalogService.getCatalog(projectId, catalogQuery());
    assert(
      JSON.stringify(beforeRollback) === JSON.stringify(afterRollback),
      "A rejected publication must preserve the complete prior framework catalog.",
    );
    await assertFrameworkPrivacy(firstDatabase, projectId, temporaryRoot);

    const currentFrameworkRun = await services.frameworkRepository.getCurrentCatalogRun(projectId);
    assert(currentFrameworkRun !== null, "Recovery verification requires a current framework run.");
    const abandoned = await services.frameworkRepository.beginIndex({
      analyzerSetIdentity: currentFrameworkRun.analyzerSetIdentity,
      dependencyIndexRunId: currentFrameworkRun.dependencyIndexRunId,
      projectId,
      sourceIndexRunId: currentFrameworkRun.sourceIndexRunId,
      symbolIndexRunId: currentFrameworkRun.symbolIndexRunId,
    });
    await firstDatabase.sequelize.close();
    firstDatabaseClosed = true;

    recoveryDatabase = createDatabase(config);
    await recoveryDatabase.sequelize.authenticate();
    const recoveryReader = new CountingSourceTextReader(new NodeSourceTextReader());
    const recoveryServices = createServices(recoveryDatabase, config, recoveryReader);
    const recoveredIndexCount = await recoveryServices.frameworkRepository.recoverInterruptedIndexes();
    assert(recoveredIndexCount >= 1, "Restart recovery should fail an abandoned framework run.");
    const recoveredLatest = await recoveryServices.frameworkRepository.getLatestRun(projectId);
    assert(recoveredLatest?.id === abandoned.id, "The abandoned framework run should remain latest.");
    assert(
      recoveredLatest.status === "failed" && recoveredLatest.errorCode === "index_interrupted",
      "Recovery should mark the abandoned run failed/index_interrupted.",
    );
    const recoveredCatalog = await recoveryServices.catalogService.getCatalog(projectId, catalogQuery());
    assert(recoveredCatalog.entities.length > 0, "The prior framework catalog should survive recovery.");

    const result = {
      appliedMigrations,
      entityCount: recoveredCatalog.entities.length,
      frameworkIndexId: recoveredCatalog.frameworkIndex.id,
      recoveredIndexCount,
      relationshipCount: recoveredCatalog.relationships.length,
      reusedFileCount: reusedIndex.reusedFileCount,
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
    if (recoveryDatabase !== undefined) await recoveryDatabase.sequelize.close();
    if (!firstDatabaseClosed) await firstDatabase.sequelize.close();
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

function createServices(
  database: ArcDatabase,
  config: AppConfig,
  frameworkReader: SourceTextReader,
): FrameworkServices {
  const projectRepository = new SequelizeProjectRepository(database);
  const inventoryRepository = new SequelizeProjectInventoryRepository(database);
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
  const sourceRepository = new SequelizeProjectSourceIndexRepository(database);
  const sourceService = new ProjectSourceIndexService(
    projectRepository,
    inventoryRepository,
    sourceRepository,
    new NodeSourceTextReader(),
    ignorePolicy,
    new SourceLanguageClassifier(),
    config,
  );
  const symbolRepository = new SequelizeProjectSymbolIndexRepository(database);
  const symbolService = new ProjectSymbolIndexService(
    projectRepository,
    inventoryRepository,
    sourceRepository,
    symbolRepository,
    new NodeSourceTextReader(),
    new TreeSitterSymbolExtractor(),
    config,
  );
  const dependencyRepository = new SequelizeProjectDependencyIndexRepository(database);
  const dependencyService = new ProjectDependencyIndexService(
    projectRepository,
    inventoryRepository,
    sourceRepository,
    dependencyRepository,
    new NodeSourceTextReader(),
    new TreeSitterDependencyExtractor(),
    new TypeScriptProjectModuleResolver(),
    config,
  );
  const frameworkRepository = new SequelizeProjectFrameworkIndexRepository(database);
  const frameworkService = new ProjectFrameworkIndexService(
    projectRepository,
    sourceRepository,
    symbolRepository,
    dependencyRepository,
    frameworkRepository,
    frameworkReader,
    config,
  );
  const catalogService = new ProjectFrameworkCatalogService(
    projectRepository,
    sourceRepository,
    symbolRepository,
    dependencyRepository,
    frameworkRepository,
    pathNormalizer,
    config,
  );
  return {
    catalogService,
    dependencyService,
    frameworkRepository,
    frameworkService,
    inventoryService,
    sourceRepository,
    sourceService,
    symbolService,
  };
}

class CountingSourceTextReader implements SourceTextReader {
  public codeReads = 0;

  public constructor(private readonly delegate: SourceTextReader) {}

  public inspect(input: Parameters<SourceTextReader["inspect"]>[0]) {
    if (/\.[cm]?[jt]sx?$/u.test(input.file.path)) this.codeReads += 1;
    return this.delegate.inspect(input);
  }

  public reset(): void {
    this.codeReads = 0;
  }

  public hasCodeReads(): boolean {
    return this.codeReads > 0;
  }
}

async function createFixture(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, "packages", "nest", "src"), { recursive: true });
  await mkdir(join(rootPath, "packages", "api", "src"), { recursive: true });
  await mkdir(join(rootPath, "packages", "web", "app"), { recursive: true });
  await mkdir(join(rootPath, "packages", "db", "src"), { recursive: true });
  await writePackage(rootPath, "nest", { "@nestjs/common": "^11.0.0" });
  await writePackage(rootPath, "api", { express: "^5.0.0" });
  await writePackage(rootPath, "web", { next: "^15.0.0", react: "^19.0.0" });
  await writePackage(rootPath, "db", { sequelize: "^6.0.0" });
  await writeFile(
    join(rootPath, "packages", "nest", "src", "app.ts"),
    `import { Controller, Get, Injectable, Module } from "@nestjs/common";
@Injectable()
export class UsersService {}
@Controller("users")
export class UsersController {
  public constructor(private readonly usersService: UsersService) {}
  @Get(":id")
  public getUser() { return this.usersService; }
}
@Module({ controllers: [UsersController], providers: [UsersService] })
export class AppModule {}
`,
  );
  await writeFile(
    join(rootPath, expressPath),
    `import express from "express";
// ${privateBodyMarker}
export const app = express();
app.get("/health", (_request, response) => response.send("ok"));
`,
  );
  await writeFile(
    join(rootPath, "packages", "web", "app", "card.tsx"),
    'import React from "react";\nexport function Card() { return <article>Arc</article>; }\n',
  );
  await writeFile(
    join(rootPath, "packages", "web", "app", "page.tsx"),
    'import React from "react";\nimport { Card } from "./card";\nexport default function Page() { return <Card />; }\n',
  );
  await writeFile(
    join(rootPath, sequelizePath),
    `import { DataTypes, Model } from "sequelize";
export class User extends Model {}
export class Post extends Model {}
User.init({ name: { type: DataTypes.STRING, allowNull: false } }, { modelName: "User", tableName: "users" });
Post.init({ title: DataTypes.STRING }, { modelName: "Post", tableName: "posts" });
User.hasMany(Post, { foreignKey: "userId" });
`,
  );
}

async function writePackage(rootPath: string, name: string, dependencies: Record<string, string>): Promise<void> {
  await writeFile(
    join(rootPath, "packages", name, "package.json"),
    `${JSON.stringify({ dependencies, name: `arc-${name}`, private: true, type: "module" }, null, 2)}\n`,
  );
}

function catalogQuery(overrides: Partial<ProjectFrameworkCatalogQuery> = {}): ProjectFrameworkCatalogQuery {
  return {
    framework: [],
    includeRelations: true,
    kind: [],
    maxEntities: 5_000,
    maxRelationships: 10_000,
    ...overrides,
  };
}

function assertFrameworkCoverage(catalog: Awaited<ReturnType<ProjectFrameworkCatalogService["getCatalog"]>>): void {
  const frameworks = new Set(catalog.entities.map((entity) => entity.framework));
  for (const framework of ["nestjs", "express", "nextjs", "react", "sequelize"] as const) {
    assert(frameworks.has(framework), `The fixture should produce ${framework} entities.`);
  }
  assert(catalog.relationships.length > 0, "The fixture should produce framework relationships.");
  assert(
    catalog.entities.some((entity) => entity.entityKind === "controller"),
    "The fixture should contain a NestJS controller.",
  );
  assert(
    catalog.entities.some((entity) => entity.framework === "nextjs" && entity.entityKind === "page"),
    "The fixture should contain a Next.js page.",
  );
  assert(
    catalog.entities.some((entity) => entity.framework === "sequelize" && entity.entityKind === "model"),
    "The fixture should contain Sequelize models.",
  );
}

function assertStableEntityIds(
  expected: ReadonlyMap<string, string>,
  entities: readonly { readonly identityKey: string; readonly id: string }[],
  operation: string,
): void {
  for (const entity of entities) {
    const expectedId = expected.get(entity.identityKey);
    if (expectedId !== undefined) {
      assert(entity.id === expectedId, `Entity UUID ${entity.identityKey} should survive ${operation}.`);
    }
  }
}

function assertStableUnrelatedEntityIds(
  expected: ReadonlyMap<string, string>,
  entities: readonly { readonly identityKey: string; readonly id: string; readonly path: string }[],
  changedPath: string,
): void {
  const unrelated = entities.filter((entity) => entity.path !== changedPath);
  assert(unrelated.length > 0, "The fixture should retain unrelated framework entities.");
  assertStableEntityIds(expected, unrelated, "an unrelated source change");
}

async function rejectsWithStaleCatalog(service: ProjectFrameworkCatalogService, projectId: string): Promise<boolean> {
  try {
    await service.getCatalog(projectId, catalogQuery());
    return false;
  } catch (error) {
    return error instanceof ProjectFrameworkCatalogStaleError;
  }
}

async function assertAtomicRollback(
  database: ArcDatabase,
  services: FrameworkServices,
  projectId: string,
): Promise<void> {
  const current = await services.frameworkRepository.getCurrentCatalogRun(projectId);
  const reusable = await services.frameworkRepository.getCurrentReusableCatalog(projectId);
  assert(current !== null && reusable !== null, "Rollback verification requires a current framework catalog.");
  const file = reusable.files.find((candidate) => candidate.status === "analyzed");
  const scope =
    file === undefined ? undefined : reusable.scopes.find((candidate) => candidate.scopeKey === file.scopeKey);
  assert(file !== undefined && scope !== undefined, "Rollback verification requires an analyzed framework file.");
  const run = await services.frameworkRepository.beginIndex({
    analyzerSetIdentity: current.analyzerSetIdentity,
    dependencyIndexRunId: current.dependencyIndexRunId,
    projectId,
    sourceIndexRunId: current.sourceIndexRunId,
    symbolIndexRunId: current.symbolIndexRunId,
  });
  let rejected = false;
  try {
    await services.frameworkRepository.publishIndex({
      analyzedFileCount: 1,
      dependencyIndexRunId: current.dependencyIndexRunId,
      failedFileCount: 0,
      files: [
        {
          ...file,
          entities: [
            {
              attributes: { kind: "express_application", localName: "invalid" },
              certainty: "declared",
              entityKind: "application",
              evidenceKey: "rollback-invalid",
              evidenceKind: "call_expression",
              framework: "express",
              identityKey: "f".repeat(64),
              name: "x".repeat(4_097),
              range: null,
              relativePath: file.relativePath,
              scopeKey: scope.scopeKey,
              sourceFileId: file.sourceFileId,
              symbolId: null,
            },
          ],
          relationships: [],
        },
      ],
      frameworkIndexId: run.id,
      limitReasons: [],
      projectId,
      reusedFileCount: 0,
      scopes: [scope],
      sourceIndexRunId: current.sourceIndexRunId,
      symbolIndexRunId: current.symbolIndexRunId,
      unsupportedFileCount: 0,
      warnings: [],
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "PostgreSQL should reject an oversized framework entity atomically.");
  try {
    await services.frameworkRepository.failIndex(projectId, run.id, "framework_persistence_error");
  } catch {
    throw new ProjectFrameworkIndexFailedError();
  }
  assert(
    (await services.frameworkRepository.getCurrentCatalogRun(projectId))?.id === current.id,
    "A failed framework publication must preserve the previous current run.",
  );
  const invalidCount = await database.models.projectFrameworkEntities.count({
    where: { identityKey: "f".repeat(64), projectId },
  });
  assert(invalidCount === 0, "A rolled-back framework entity must not persist.");
}

async function assertFrameworkPrivacy(database: ArcDatabase, projectId: string, rootPath: string): Promise<void> {
  const [scopeTable, fileTable, entityTable, relationshipTable, scopes, files, entities, relationships] =
    await Promise.all([
      database.sequelize.getQueryInterface().describeTable("project_framework_scopes"),
      database.sequelize.getQueryInterface().describeTable("project_framework_files"),
      database.sequelize.getQueryInterface().describeTable("project_framework_entities"),
      database.sequelize.getQueryInterface().describeTable("project_framework_relationships"),
      database.models.projectFrameworkScopes.findAll({ where: { projectId } }),
      database.models.projectFrameworkFiles.findAll({ where: { projectId } }),
      database.models.projectFrameworkEntities.findAll({ where: { projectId } }),
      database.models.projectFrameworkRelationships.findAll({ where: { projectId } }),
    ]);
  const forbiddenColumns = [
    "content",
    "source_text",
    "body",
    "snippet",
    "syntax_tree",
    "ast",
    "absolute_path",
    "diagnostics",
    "failed_lookup",
  ];
  assert(
    forbiddenColumns.every(
      (column) =>
        !Object.hasOwn(scopeTable, column) &&
        !Object.hasOwn(fileTable, column) &&
        !Object.hasOwn(entityTable, column) &&
        !Object.hasOwn(relationshipTable, column),
    ),
    "Framework tables must not contain source bodies, syntax trees, diagnostics, or absolute paths.",
  );
  const persisted = JSON.stringify([
    ...scopes.map((row) => row.get({ plain: true })),
    ...files.map((row) => row.get({ plain: true })),
    ...entities.map((row) => row.get({ plain: true })),
    ...relationships.map((row) => row.get({ plain: true })),
  ]);
  assert(!persisted.includes(privateBodyMarker), "Source comments must not enter framework persistence.");
  assert(!persisted.includes(rootPath), "Absolute project paths must not enter framework persistence.");
}

async function assertProjectCleanup(database: ArcDatabase, projectId: string): Promise<void> {
  const counts = await Promise.all([
    database.models.projects.count({ where: { id: projectId } }),
    database.models.projectFrameworkIndexRuns.count({ where: { projectId } }),
    database.models.projectFrameworkScopes.count({ where: { projectId } }),
    database.models.projectFrameworkFiles.count({ where: { projectId } }),
    database.models.projectFrameworkEntities.count({ where: { projectId } }),
    database.models.projectFrameworkRelationships.count({ where: { projectId } }),
  ]);
  assert(
    counts.every((count) => count === 0),
    "Verification cleanup must remove every temporary framework catalog row.",
  );
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("framework-index-verify");
  logger.error("PostgreSQL project framework-index verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
