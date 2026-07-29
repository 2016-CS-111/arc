import { UniqueConstraintError, type Transaction } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import type { ArcDatabase, ProjectFrameworkIndexRunAttributes } from "../../../database/database.types.js";
import type { ProjectFrameworkEntityModel } from "../../../database/models/project-framework-entity.model.js";
import type { ProjectFrameworkFileModel } from "../../../database/models/project-framework-file.model.js";
import type { ProjectFrameworkIndexRunModel } from "../../../database/models/project-framework-index-run.model.js";
import type { ProjectFrameworkRelationshipModel } from "../../../database/models/project-framework-relationship.model.js";
import type { ProjectFrameworkScopeModel } from "../../../database/models/project-framework-scope.model.js";
import type { PublishProjectFrameworkIndexInput } from "../domain/project-framework-index.types.js";
import { ProjectFrameworkIndexAlreadyRunningError } from "../domain/project.errors.js";
import { SequelizeProjectFrameworkIndexRepository } from "./sequelize-project-framework-index.repository.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const frameworkIndexId = "00000000-0000-4000-8000-000000000001";
const sourceIndexRunId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";
const symbolIndexRunId = "bfcd6c71-f627-45cb-b133-65cf2e129f13";
const dependencyIndexRunId = "76e5ee0b-608d-4792-91c5-fd46579e74e4";
const sourceFileId = "83107b40-6495-455f-a557-b64b29ef6af1";
const scopeId = "b4bf0c2a-9d50-4569-906f-7cfa2798f91e";
const fileId = "2c537d6c-193f-45d1-a07e-0c0cc84c454e";
const sourceEntityId = "90719f02-3837-44d6-a685-20046ed7f3f5";
const targetEntityId = "c086565c-1007-448a-a035-efea35e67665";
const relationshipId = "22c451b8-f08a-4fef-8190-784ee927104c";
const scopeKey = "a".repeat(64);
const sourceIdentity = "b".repeat(64);
const targetIdentity = "c".repeat(64);

function createRun(status: ProjectFrameworkIndexRunAttributes["status"] = "running") {
  let attributes: ProjectFrameworkIndexRunAttributes = {
    analyzedFileCount: status === "running" ? 0 : 1,
    analyzerSetIdentity: "d".repeat(64),
    completedAt: status === "running" ? null : new Date("2026-07-29T12:01:00.000Z"),
    dependencyIndexRunId,
    entityCount: status === "running" ? 0 : 2,
    errorCode: status === "failed" ? "index_interrupted" : null,
    failedFileCount: 0,
    id: frameworkIndexId,
    limitReasons: [],
    omissionCount: 0,
    projectId,
    relationshipCount: status === "running" ? 0 : 1,
    reusedFileCount: 0,
    scopeCount: status === "running" ? 0 : 1,
    sourceIndexRunId,
    startedAt: new Date("2026-07-29T12:00:00.000Z"),
    status,
    symbolIndexRunId,
    unresolvedRelationshipCount: 0,
    unsupportedFileCount: 0,
    warnings: [],
  };
  const save = vi.fn(() => Promise.resolve());
  const set = vi.fn((values: Partial<ProjectFrameworkIndexRunAttributes>) => {
    attributes = { ...attributes, ...values };
  });
  const run = {
    get: () => attributes,
    save,
    set,
  } as unknown as ProjectFrameworkIndexRunModel;
  return { run, save, set };
}

function createScope(): ProjectFrameworkScopeModel {
  return {
    contextHash: "e".repeat(64),
    evidence: [
      {
        dependencyEdgeId: null,
        kind: "package_metadata",
        relativePath: "package.json",
        sourceFileId,
      },
    ],
    framework: "express",
    frameworkIndexRunId: frameworkIndexId,
    id: scopeId,
    packageName: "arc-api",
    projectId,
    rootPath: ".",
    scopeKey,
  } as ProjectFrameworkScopeModel;
}

function createFile(): ProjectFrameworkFileModel {
  return {
    analyzedAt: new Date("2026-07-29T12:00:30.000Z"),
    analyzerIdentity: "effective-analyzer@1",
    entityCount: 2,
    errorCode: null,
    evidence: [],
    extractionOmissionCount: 0,
    extractionOmissionReasons: [],
    extractorIdentity: "tree-sitter/typescript/framework@1",
    frameworkIndexRunId: frameworkIndexId,
    hasSyntaxErrors: false,
    id: fileId,
    language: "typescript",
    omissionCount: 0,
    projectId,
    relationshipCount: 1,
    relativePath: "src/main.ts",
    scopeId,
    sourceContentHash: "f".repeat(64),
    sourceFileId,
    status: "analyzed",
  } as ProjectFrameworkFileModel;
}

function createDatabase(run: ProjectFrameworkIndexRunModel) {
  const create = vi.fn(() => Promise.resolve(run));
  const findRun = vi.fn(() => Promise.resolve(run));
  const updateRuns = vi.fn(() => Promise.resolve([0]));
  const upsertScope = vi.fn(() => Promise.resolve([createScope(), true]));
  const destroyScopes = vi.fn(() => Promise.resolve(0));
  const findScopes = vi.fn(() => Promise.resolve([createScope()]));
  const upsertFile = vi.fn(() => Promise.resolve([createFile(), true]));
  const destroyFiles = vi.fn(() => Promise.resolve(0));
  const findFiles = vi.fn(() => Promise.resolve([createFile()]));
  const upsertEntity = vi
    .fn()
    .mockResolvedValueOnce([{ id: sourceEntityId } as ProjectFrameworkEntityModel, true])
    .mockResolvedValueOnce([{ id: targetEntityId } as ProjectFrameworkEntityModel, true]);
  const destroyEntities = vi.fn(() => Promise.resolve(0));
  const upsertRelationship = vi.fn(() =>
    Promise.resolve([{ id: relationshipId } as ProjectFrameworkRelationshipModel, true]),
  );
  const destroyRelationships = vi.fn(() => Promise.resolve(0));
  const transactionValue = { LOCK: { UPDATE: "UPDATE" } } as unknown as Transaction;
  const transaction = vi.fn((operation: (value: Transaction) => Promise<unknown>) => operation(transactionValue));
  const database = {
    models: {
      chatMessages: {} as ArcDatabase["models"]["chatMessages"],
      chatSessions: {} as ArcDatabase["models"]["chatSessions"],
      projectDependencyBindings: {} as ArcDatabase["models"]["projectDependencyBindings"],
      projectDependencyEdges: {} as ArcDatabase["models"]["projectDependencyEdges"],
      projectDependencyFiles: {} as ArcDatabase["models"]["projectDependencyFiles"],
      projectDependencyIndexRuns: {} as ArcDatabase["models"]["projectDependencyIndexRuns"],
      projectFiles: {} as ArcDatabase["models"]["projectFiles"],
      projectFrameworkEntities: {
        destroy: destroyEntities,
        upsert: upsertEntity,
      } as unknown as ArcDatabase["models"]["projectFrameworkEntities"],
      projectFrameworkFiles: {
        destroy: destroyFiles,
        findAll: findFiles,
        upsert: upsertFile,
      } as unknown as ArcDatabase["models"]["projectFrameworkFiles"],
      projectFrameworkIndexRuns: {
        create,
        findOne: findRun,
        update: updateRuns,
      } as unknown as ArcDatabase["models"]["projectFrameworkIndexRuns"],
      projectFrameworkRelationships: {
        destroy: destroyRelationships,
        upsert: upsertRelationship,
      } as unknown as ArcDatabase["models"]["projectFrameworkRelationships"],
      projectFrameworkScopes: {
        destroy: destroyScopes,
        findAll: findScopes,
        upsert: upsertScope,
      } as unknown as ArcDatabase["models"]["projectFrameworkScopes"],
      projects: {} as ArcDatabase["models"]["projects"],
      projectScans: {} as ArcDatabase["models"]["projectScans"],
      projectSourceFiles: {} as ArcDatabase["models"]["projectSourceFiles"],
      projectSourceIndexRuns: {} as ArcDatabase["models"]["projectSourceIndexRuns"],
      projectSymbolFiles: {} as ArcDatabase["models"]["projectSymbolFiles"],
      projectSymbolIndexRuns: {} as ArcDatabase["models"]["projectSymbolIndexRuns"],
      projectSymbols: {} as ArcDatabase["models"]["projectSymbols"],
    },
    sequelize: { transaction } as unknown as ArcDatabase["sequelize"],
  } satisfies ArcDatabase;
  return {
    create,
    database,
    destroyEntities,
    destroyFiles,
    destroyRelationships,
    destroyScopes,
    findRun,
    save: (run as unknown as { save: ReturnType<typeof vi.fn> }).save,
    transaction,
    transactionValue,
    updateRuns,
    upsertEntity,
    upsertFile,
    upsertRelationship,
    upsertScope,
  };
}

function publishInput(): PublishProjectFrameworkIndexInput {
  return {
    analyzedFileCount: 1,
    dependencyIndexRunId,
    failedFileCount: 0,
    files: [
      {
        analyzerIdentity: "effective-analyzer@1",
        entities: [
          {
            attributes: { kind: "express_application", localName: "app" },
            certainty: "declared",
            entityKind: "application",
            evidenceKey: "app-call",
            evidenceKind: "call_expression",
            framework: "express",
            identityKey: sourceIdentity,
            name: "app",
            range: null,
            relativePath: "src/main.ts",
            scopeKey,
            sourceFileId,
            symbolId: null,
          },
          {
            attributes: {
              dynamicPath: false,
              handlerNames: [],
              httpMethod: "GET",
              kind: "express_route",
              ownerName: "app",
              paths: ["/health"],
            },
            certainty: "declared",
            entityKind: "route",
            evidenceKey: "route-call",
            evidenceKind: "call_expression",
            framework: "express",
            identityKey: targetIdentity,
            name: "GET /health",
            range: null,
            relativePath: "src/main.ts",
            scopeKey,
            sourceFileId,
            symbolId: null,
          },
        ],
        errorCode: null,
        evidence: [],
        extractionOmissionCount: 0,
        extractionOmissionReasons: [],
        extractorIdentity: "tree-sitter/typescript/framework@1",
        hasSyntaxErrors: false,
        language: "typescript",
        omissionCount: 0,
        relationships: [
          {
            attributes: { httpMethod: "GET", kind: "express_route_ownership" },
            certainty: "linked",
            dependencyEdgeId: null,
            evidenceKey: "route-call",
            evidenceKind: "call_expression",
            framework: "express",
            identityKey: "9".repeat(64),
            range: null,
            relationshipKind: "handles_route",
            sourceEntityIdentityKey: sourceIdentity,
            sourceFileId,
            symbolId: null,
            targetEntityIdentityKey: targetIdentity,
            targetName: "GET /health",
          },
        ],
        relativePath: "src/main.ts",
        scopeKey,
        sourceContentHash: "f".repeat(64),
        sourceFileId,
        status: "analyzed",
      },
    ],
    frameworkIndexId,
    limitReasons: [],
    projectId,
    reusedFileCount: 0,
    scopes: [
      {
        contextHash: "e".repeat(64),
        evidence: createScope().evidence,
        framework: "express",
        packageName: "arc-api",
        rootPath: ".",
        scopeKey,
      },
    ],
    sourceIndexRunId,
    symbolIndexRunId,
    unsupportedFileCount: 0,
    warnings: [],
  };
}

describe("SequelizeProjectFrameworkIndexRepository", () => {
  it("maps concurrent begin conflicts to the framework domain error", async () => {
    const { run } = createRun();
    const fixture = createDatabase(run);
    const repository = new SequelizeProjectFrameworkIndexRepository(fixture.database);

    await expect(
      repository.beginIndex({
        analyzerSetIdentity: "d".repeat(64),
        dependencyIndexRunId,
        projectId,
        sourceIndexRunId,
        symbolIndexRunId,
      }),
    ).resolves.toMatchObject({ id: frameworkIndexId, status: "running" });

    fixture.create.mockRejectedValueOnce(new UniqueConstraintError({ errors: [] }));
    await expect(
      repository.beginIndex({
        analyzerSetIdentity: "d".repeat(64),
        dependencyIndexRunId,
        projectId,
        sourceIndexRunId,
        symbolIndexRunId,
      }),
    ).rejects.toBeInstanceOf(ProjectFrameworkIndexAlreadyRunningError);
  });

  it("atomically upserts stable identities, removes stale rows, and completes the run", async () => {
    const { run, save, set } = createRun();
    const fixture = createDatabase(run);
    const repository = new SequelizeProjectFrameworkIndexRepository(fixture.database);

    await expect(repository.publishIndex(publishInput())).resolves.toMatchObject({
      analyzedFileCount: 1,
      entityCount: 2,
      relationshipCount: 1,
      status: "completed",
    });
    expect(fixture.upsertScope).toHaveBeenCalledWith(
      expect.objectContaining({ evidence: createScope().evidence, scopeKey }),
      { transaction: fixture.transactionValue },
    );
    expect(fixture.upsertFile).toHaveBeenCalledWith(expect.objectContaining({ evidence: [], sourceFileId }), {
      transaction: fixture.transactionValue,
    });
    expect(fixture.upsertEntity).toHaveBeenCalledWith(expect.objectContaining({ identityKey: sourceIdentity }), {
      transaction: fixture.transactionValue,
    });
    expect(fixture.upsertRelationship).toHaveBeenCalledWith(
      expect.objectContaining({
        identityKey: "9".repeat(64),
        sourceEntityId,
        targetEntityId,
      }),
      { transaction: fixture.transactionValue },
    );
    expect(fixture.destroyRelationships).toHaveBeenCalledOnce();
    expect(fixture.destroyEntities).toHaveBeenCalledOnce();
    expect(fixture.destroyFiles).toHaveBeenCalledOnce();
    expect(fixture.destroyScopes).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(save).toHaveBeenCalledWith({ transaction: fixture.transactionValue });
  });

  it("does not complete the run when publication fails inside the transaction", async () => {
    const { run, save } = createRun();
    const fixture = createDatabase(run);
    fixture.upsertRelationship.mockRejectedValueOnce(new Error("relationship write failed"));
    const repository = new SequelizeProjectFrameworkIndexRepository(fixture.database);

    await expect(repository.publishIndex(publishInput())).rejects.toThrow("relationship write failed");
    expect(save).not.toHaveBeenCalled();
  });

  it("loads reusable evidence and recovers interrupted indexes", async () => {
    const { run } = createRun("completed");
    const fixture = createDatabase(run);
    fixture.updateRuns.mockResolvedValueOnce([2]);
    const repository = new SequelizeProjectFrameworkIndexRepository(fixture.database);

    await expect(repository.getCurrentReusableCatalog(projectId)).resolves.toMatchObject({
      files: [
        {
          evidence: [],
          extractorIdentity: "tree-sitter/typescript/framework@1",
          scopeKey,
          sourceFileId,
          status: "analyzed",
        },
      ],
      scopes: [{ evidence: createScope().evidence, framework: "express", scopeKey }],
    });
    await expect(repository.recoverInterruptedIndexes()).resolves.toBe(2);
    expect(fixture.updateRuns).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "index_interrupted", status: "failed" }),
      { where: { status: "running" } },
    );
  });
});
