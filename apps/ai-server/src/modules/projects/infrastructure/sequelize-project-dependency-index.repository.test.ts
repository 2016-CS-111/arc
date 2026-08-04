import { Op, UniqueConstraintError, type Transaction } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import type {
  ArcDatabase,
  ProjectDependencyBindingAttributes,
  ProjectDependencyEdgeAttributes,
  ProjectDependencyFileAttributes,
  ProjectDependencyIndexRunAttributes,
} from "../../../database/database.types.js";
import type { ProjectDependencyBindingModel } from "../../../database/models/project-dependency-binding.model.js";
import type { ProjectDependencyEdgeModel } from "../../../database/models/project-dependency-edge.model.js";
import type { ProjectDependencyFileModel } from "../../../database/models/project-dependency-file.model.js";
import type { ProjectDependencyIndexRunModel } from "../../../database/models/project-dependency-index-run.model.js";
import { ProjectDependencyIndexAlreadyRunningError } from "../domain/project.errors.js";
import { SequelizeProjectDependencyIndexRepository } from "./sequelize-project-dependency-index.repository.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const sourceIndexRunId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";
const dependencyIndexId = "76e5ee0b-608d-4792-91c5-fd46579e74e4";
const sourceFileId = "ac871053-d9f1-4f28-b022-1a18079927bb";
const targetSourceFileId = "83107b40-6495-455f-a557-b64b29ef6af1";
const dependencyFileId = "f3a52f98-f0cd-4301-a79f-b20f235308e7";
const dependencyEdgeId = "0ff1777d-03a4-4299-8303-4da001503f68";
const dependencyBindingId = "4670490d-feea-450e-b7ad-8405b7e414d2";
const extractionKey = "a".repeat(64);
const bindingKey = "b".repeat(64);

function createRun() {
  let attributes: ProjectDependencyIndexRunAttributes = {
    bindingCount: 0,
    builtinEdgeCount: 0,
    completedAt: null,
    edgeCount: 0,
    errorCode: null,
    externalEdgeCount: 0,
    failedFileCount: 0,
    id: dependencyIndexId,
    limitReasons: [],
    localEdgeCount: 0,
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    parsedFileCount: 0,
    projectId,
    resolutionContextHash: null,
    resolverWarnings: [],
    reusedFileCount: 0,
    sourceIndexRunId,
    startedAt: new Date("2026-07-28T11:00:00.000Z"),
    status: "running",
    unresolvedEdgeCount: 0,
    unsupportedFileCount: 0,
  };
  const save = vi.fn(() => Promise.resolve());
  const set = vi.fn((values: Partial<ProjectDependencyIndexRunAttributes>) => {
    attributes = { ...attributes, ...values };
  });
  const run = {
    get: (): ProjectDependencyIndexRunAttributes => attributes,
    resolutionContextHash: null,
    resolverWarnings: [],
    save,
    set,
  } as unknown as ProjectDependencyIndexRunModel;
  return { run, save, set };
}

function createDependencyFile(): ProjectDependencyFileModel {
  const attributes: ProjectDependencyFileAttributes = {
    bindingCount: 1,
    dependencyIndexRunId: dependencyIndexId,
    edgeCount: 1,
    errorCode: null,
    extractedAt: new Date("2026-07-28T11:01:00.000Z"),
    extractorIdentity: "tree-sitter/typescript/dependencies@1/edges=1000",
    hasSyntaxErrors: false,
    id: dependencyFileId,
    language: "typescript",
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    projectId,
    relativePath: "src/main.ts",
    sourceContentHash: "c".repeat(64),
    sourceFileId,
    status: "extracted",
  };
  return {
    get: () => attributes,
    id: dependencyFileId,
    relativePath: attributes.relativePath,
    sourceFileId,
  } as unknown as ProjectDependencyFileModel;
}

function createDependencyEdge(): ProjectDependencyEdgeModel {
  const attributes: ProjectDependencyEdgeAttributes = {
    dependencyFileId,
    dependencyIndexRunId: dependencyIndexId,
    endByte: 31,
    endColumnByte: 31,
    endLine: 0,
    externalPackage: null,
    extractionKey,
    id: dependencyEdgeId,
    kind: "static_import",
    projectId,
    resolutionKind: "local",
    sourceFileId,
    specifier: "./target.js",
    specifierEndByte: 29,
    specifierEndColumnByte: 29,
    specifierEndLine: 0,
    specifierStartByte: 18,
    specifierStartColumnByte: 18,
    specifierStartLine: 0,
    startByte: 0,
    startColumnByte: 0,
    startLine: 0,
    targetRelativePath: "src/target.ts",
    targetSourceFileId,
    typeOnly: false,
    unresolvedReason: null,
  };
  return {
    dependencyFileId,
    extractionKey,
    get: () => attributes,
    id: dependencyEdgeId,
    sourceFileId,
  } as unknown as ProjectDependencyEdgeModel;
}

function createDependencyBinding(): ProjectDependencyBindingModel {
  const attributes: ProjectDependencyBindingAttributes = {
    bindingKey,
    dependencyEdgeId,
    dependencyIndexRunId: dependencyIndexId,
    endByte: 12,
    endColumnByte: 12,
    endLine: 0,
    exportedName: null,
    id: dependencyBindingId,
    importedName: "target",
    kind: "named",
    localName: "target",
    projectId,
    sourceFileId,
    startByte: 6,
    startColumnByte: 6,
    startLine: 0,
    typeOnly: false,
  };
  return {
    get: () => attributes,
  } as unknown as ProjectDependencyBindingModel;
}

function createDatabase(run: ProjectDependencyIndexRunModel) {
  const create = vi.fn(() => Promise.resolve(run));
  const findRun = vi.fn(() => Promise.resolve(run));
  const updateRuns = vi.fn(() => Promise.resolve([0]));
  const bulkCreateFiles = vi.fn(() => Promise.resolve([]));
  const findFiles = vi.fn(() => Promise.resolve([createDependencyFile()]));
  const findFile = vi.fn(() => Promise.resolve(createDependencyFile()));
  const destroyFiles = vi.fn(() => Promise.resolve(0));
  const bulkCreateEdges = vi.fn(() => Promise.resolve([]));
  const findEdges = vi.fn(() => Promise.resolve([createDependencyEdge()]));
  const destroyEdges = vi.fn(() => Promise.resolve(0));
  const bulkCreateBindings = vi.fn(() => Promise.resolve([]));
  const findBindings = vi.fn(() => Promise.resolve([createDependencyBinding()]));
  const destroyBindings = vi.fn(() => Promise.resolve(0));
  const transactionValue = { id: "transaction" } as unknown as Transaction;
  const transaction = vi.fn((operation: (transaction: Transaction) => Promise<unknown>) => operation(transactionValue));
  const database = {
    models: {
      projectDependencyBindings: {
        bulkCreate: bulkCreateBindings,
        destroy: destroyBindings,
        findAll: findBindings,
      },
      projectDependencyEdges: {
        bulkCreate: bulkCreateEdges,
        destroy: destroyEdges,
        findAll: findEdges,
      },
      projectDependencyFiles: {
        bulkCreate: bulkCreateFiles,
        destroy: destroyFiles,
        findAll: findFiles,
        findOne: findFile,
      },
      projectDependencyIndexRuns: {
        create,
        findOne: findRun,
        update: updateRuns,
      },
    } as unknown as ArcDatabase["models"],
    sequelize: { transaction } as unknown as ArcDatabase["sequelize"],
  } satisfies ArcDatabase;

  return {
    bulkCreateBindings,
    bulkCreateEdges,
    bulkCreateFiles,
    create,
    database,
    destroyBindings,
    destroyEdges,
    destroyFiles,
    findBindings,
    findEdges,
    findFile,
    findFiles,
    transactionValue,
    updateRuns,
  };
}

function publication() {
  return {
    batchSize: 1,
    bindingCount: 1,
    builtinEdgeCount: 0,
    dependencyIndexId,
    edgeCount: 1,
    externalEdgeCount: 0,
    failedFileCount: 0,
    files: [
      {
        bindingCount: 1,
        dependencies: [
          {
            bindings: [
              {
                bindingKey,
                exportedName: null,
                importedName: "target",
                kind: "named" as const,
                localName: "target",
                range: {
                  endByte: 12,
                  endColumnByte: 12,
                  endLine: 0,
                  startByte: 6,
                  startColumnByte: 6,
                  startLine: 0,
                },
                typeOnly: false,
              },
            ],
            extractionKey,
            kind: "static_import" as const,
            range: {
              endByte: 31,
              endColumnByte: 31,
              endLine: 0,
              startByte: 0,
              startColumnByte: 0,
              startLine: 0,
            },
            resolution: {
              kind: "local" as const,
              targetRelativePath: "src/target.ts",
              targetSourceFileId,
            },
            specifier: "./target.js",
            specifierRange: {
              endByte: 29,
              endColumnByte: 29,
              endLine: 0,
              startByte: 18,
              startColumnByte: 18,
              startLine: 0,
            },
            typeOnly: false,
          },
        ],
        edgeCount: 1,
        errorCode: null,
        extractedAt: "2026-07-28T11:01:00.000Z",
        extractorIdentity: "tree-sitter/typescript/dependencies@1/edges=1000",
        hasSyntaxErrors: false,
        language: "typescript",
        omittedBindingCount: 0,
        omittedEdgeCount: 0,
        relativePath: "src/main.ts",
        sourceContentHash: "c".repeat(64),
        sourceFileId,
        status: "extracted" as const,
      },
    ],
    limitReasons: [],
    localEdgeCount: 1,
    omittedBindingCount: 0,
    omittedEdgeCount: 0,
    parsedFileCount: 1,
    projectId,
    resolutionContextHash: "d".repeat(64),
    resolverWarnings: ["config_missing" as const],
    reusedFileCount: 0,
    sourceIndexRunId,
    unresolvedEdgeCount: 0,
    unsupportedFileCount: 0,
  };
}

describe("SequelizeProjectDependencyIndexRepository", () => {
  it("creates one running index and maps the partial unique-index conflict", async () => {
    const { run } = createRun();
    const { create, database } = createDatabase(run);
    const repository = new SequelizeProjectDependencyIndexRepository(database);

    await expect(repository.beginIndex(projectId, sourceIndexRunId)).resolves.toMatchObject({
      id: dependencyIndexId,
      status: "running",
    });
    expect(create).toHaveBeenCalledWith({ projectId, sourceIndexRunId });

    create.mockRejectedValueOnce(new UniqueConstraintError({ errors: [] }));
    await expect(repository.beginIndex(projectId, sourceIndexRunId)).rejects.toBeInstanceOf(
      ProjectDependencyIndexAlreadyRunningError,
    );
  });

  it("atomically upserts the full graph and sweeps stale rows by run identity", async () => {
    const { run, save, set } = createRun();
    const {
      bulkCreateBindings,
      bulkCreateEdges,
      bulkCreateFiles,
      database,
      destroyBindings,
      destroyEdges,
      destroyFiles,
      transactionValue,
    } = createDatabase(run);
    const repository = new SequelizeProjectDependencyIndexRepository(database);

    await expect(repository.publishIndex(publication())).resolves.toMatchObject({
      bindingCount: 1,
      edgeCount: 1,
      resolutionContextHash: "d".repeat(64),
      status: "completed",
    });

    expect(bulkCreateFiles).toHaveBeenCalledWith(
      [expect.objectContaining({ dependencyIndexRunId: dependencyIndexId, sourceFileId })],
      expect.objectContaining({
        conflictAttributes: ["projectId", "sourceFileId"],
        transaction: transactionValue,
      }),
    );
    expect(bulkCreateEdges).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          dependencyFileId,
          extractionKey,
          targetRelativePath: "src/target.ts",
        }),
      ],
      expect.objectContaining({
        conflictAttributes: ["dependencyFileId", "extractionKey"],
        transaction: transactionValue,
      }),
    );
    expect(bulkCreateBindings).toHaveBeenCalledWith(
      [expect.objectContaining({ bindingKey, dependencyEdgeId })],
      expect.objectContaining({
        conflictAttributes: ["dependencyEdgeId", "bindingKey"],
        transaction: transactionValue,
      }),
    );
    const staleWhere = {
      dependencyIndexRunId: { [Op.ne]: dependencyIndexId },
      projectId,
    };
    expect(destroyBindings).toHaveBeenCalledWith({ transaction: transactionValue, where: staleWhere });
    expect(destroyEdges).toHaveBeenCalledWith({ transaction: transactionValue, where: staleWhere });
    expect(destroyFiles).toHaveBeenCalledWith({ transaction: transactionValue, where: staleWhere });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ edgeCount: 1, status: "completed" }));
    expect(save).toHaveBeenCalledWith({ transaction: transactionValue });

    const persistedRows = [
      bulkCreateFiles.mock.calls[0]?.[0],
      bulkCreateEdges.mock.calls[0]?.[0],
      bulkCreateBindings.mock.calls[0]?.[0],
    ];
    expect(JSON.stringify(persistedRows)).not.toContain("/workspace/arc");
    expect(JSON.stringify(persistedRows)).not.toContain("import { target }");
  });

  it("reconstructs reusable declarations without resolution or source bodies", async () => {
    const { run } = createRun();
    const { database } = createDatabase(run);
    const repository = new SequelizeProjectDependencyIndexRepository(database);

    await expect(repository.getCurrentFiles(projectId)).resolves.toEqual([
      expect.objectContaining({
        bindingCount: 1,
        dependencies: [
          expect.objectContaining({
            bindings: [expect.objectContaining({ bindingKey, importedName: "target" })],
            extractionKey,
            specifier: "./target.js",
          }),
        ],
        edgeCount: 1,
        sourceFileId,
        status: "extracted",
      }),
    ]);
  });

  it("reads a run-scoped graph deterministically with filters and optional bindings", async () => {
    const { run } = createRun();
    const { database, findBindings, findEdges, findFile, findFiles } = createDatabase(run);
    const repository = new SequelizeProjectDependencyIndexRepository(database);

    await expect(
      repository.findGraphFile({
        dependencyIndexId,
        projectId,
        relativePath: "src/main.ts",
      }),
    ).resolves.toEqual({
      relativePath: "src/main.ts",
      sourceFileId,
    });
    expect(findFile).toHaveBeenCalledWith({
      where: {
        dependencyIndexRunId: dependencyIndexId,
        projectId,
        relativePath: "src/main.ts",
      },
    });

    await expect(
      repository.findGraphEdges({
        dependencyIndexId,
        dependencyKinds: ["static_import"],
        direction: "both",
        excludedEdgeIds: ["87ab758d-535c-4a80-9c9c-b8bc81da83e9"],
        frontierSourceFileIds: [sourceFileId],
        includeBindings: true,
        limit: 10,
        projectId,
        resolutionKinds: ["local"],
      }),
    ).resolves.toEqual({
      edges: [
        expect.objectContaining({
          bindings: [expect.objectContaining({ bindingKey, importedName: "target" })],
          id: dependencyEdgeId,
          sourceRelativePath: "src/main.ts",
          targetRelativePath: "src/target.ts",
        }),
      ],
      hasMore: false,
    });
    const edgeQuery: unknown = findEdges.mock.calls.at(-1)?.[0];
    expect(edgeQuery).toMatchObject({
      limit: 11,
      order: [
        ["sourceFileId", "ASC"],
        ["startByte", "ASC"],
        ["extractionKey", "ASC"],
        ["id", "ASC"],
      ],
      where: {
        dependencyIndexRunId: dependencyIndexId,
        projectId,
      },
    });
    expect(findFiles).toHaveBeenLastCalledWith({
      where: {
        dependencyIndexRunId: dependencyIndexId,
        projectId,
        sourceFileId: { [Op.in]: [sourceFileId] },
      },
    });
    expect(findBindings).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dependencyEdgeId: { [Op.in]: [dependencyEdgeId] },
          dependencyIndexRunId: dependencyIndexId,
          projectId,
        },
      }),
    );
  });

  it("reads paged dependency evidence from one immutable run with optional bindings", async () => {
    const { run } = createRun();
    const { database, findBindings, findEdges, findFiles } = createDatabase(run);
    const repository = new SequelizeProjectDependencyIndexRepository(database);

    await expect(
      repository.listCatalogDependencies({
        dependencyIndexId,
        includeBindings: true,
        limit: 10,
        offset: 3,
        projectId,
        sourceFileIds: [sourceFileId],
      }),
    ).resolves.toEqual({
      dependencies: [
        expect.objectContaining({
          bindings: [expect.objectContaining({ bindingKey, localName: "target" })],
          id: dependencyEdgeId,
          sourceRelativePath: "src/main.ts",
        }),
      ],
      hasMore: false,
    });
    expect(findEdges).toHaveBeenCalledWith({
      limit: 11,
      offset: 3,
      order: [
        ["sourceFileId", "ASC"],
        ["startByte", "ASC"],
        ["extractionKey", "ASC"],
        ["id", "ASC"],
      ],
      where: {
        dependencyIndexRunId: dependencyIndexId,
        projectId,
        sourceFileId: { [Op.in]: [sourceFileId] },
      },
    });
    expect(findFiles).toHaveBeenCalledWith({
      where: {
        dependencyIndexRunId: dependencyIndexId,
        projectId,
        sourceFileId: { [Op.in]: [sourceFileId] },
      },
    });
    expect(findBindings).toHaveBeenCalled();
    await expect(
      repository.listCatalogDependencies({
        dependencyIndexId,
        includeBindings: false,
        limit: 10,
        offset: 0,
        projectId,
        sourceFileIds: [],
      }),
    ).resolves.toEqual({ dependencies: [], hasMore: false });
  });

  it("aborts publication when current file identities cannot be recovered", async () => {
    const { run } = createRun();
    const { database, findFiles } = createDatabase(run);
    findFiles.mockResolvedValueOnce([]);
    const repository = new SequelizeProjectDependencyIndexRepository(database);

    await expect(repository.publishIndex(publication())).rejects.toThrow("resolve every published dependency-file row");
  });

  it("persists failures and recovers interrupted runs without touching graph rows", async () => {
    const { run } = createRun();
    const { database, destroyEdges, updateRuns } = createDatabase(run);
    updateRuns.mockResolvedValueOnce([2]);
    const repository = new SequelizeProjectDependencyIndexRepository(database);

    await expect(
      repository.failIndex({
        dependencyIndexId,
        errorCode: "dependency_persistence_error",
        projectId,
      }),
    ).resolves.toMatchObject({
      errorCode: "dependency_persistence_error",
      status: "failed",
    });
    await expect(repository.recoverInterruptedIndexes()).resolves.toBe(2);
    expect(updateRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "index_interrupted",
        status: "failed",
      }),
      { where: { status: "running" } },
    );
    expect(destroyEdges).not.toHaveBeenCalled();
  });
});
