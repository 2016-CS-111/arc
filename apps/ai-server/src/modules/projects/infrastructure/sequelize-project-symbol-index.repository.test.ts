import { Op, UniqueConstraintError, type Transaction } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import type {
  ArcDatabase,
  ProjectSymbolFileAttributes,
  ProjectSymbolAttributes,
  ProjectSymbolIndexRunAttributes,
} from "../../../database/database.types.js";
import type { ProjectSymbolFileModel } from "../../../database/models/project-symbol-file.model.js";
import type { ProjectSymbolIndexRunModel } from "../../../database/models/project-symbol-index-run.model.js";
import type { ProjectSymbolModel } from "../../../database/models/project-symbol.model.js";
import { ProjectSymbolIndexAlreadyRunningError } from "../domain/project.errors.js";
import { SequelizeProjectSymbolIndexRepository } from "./sequelize-project-symbol-index.repository.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const sourceIndexRunId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";
const symbolIndexId = "bfcd6c71-f627-45cb-b133-65cf2e129f13";
const sourceFileId = "ac871053-d9f1-4f28-b022-1a18079927bb";
const symbolFileId = "bc53b046-4157-443f-ac89-8f5795c7b991";

function createRun() {
  let attributes: ProjectSymbolIndexRunAttributes = {
    completedAt: null,
    errorCode: null,
    failedFileCount: 0,
    id: symbolIndexId,
    limitReasons: [],
    omittedSymbolCount: 0,
    parsedFileCount: 0,
    projectId,
    reusedFileCount: 0,
    sourceIndexRunId,
    startedAt: new Date("2026-07-27T11:00:00.000Z"),
    status: "running",
    symbolCount: 0,
    unsupportedFileCount: 0,
  };
  const save = vi.fn(() => Promise.resolve());
  const set = vi.fn((values: Partial<ProjectSymbolIndexRunAttributes>) => {
    attributes = { ...attributes, ...values };
  });
  const run = {
    get: (): ProjectSymbolIndexRunAttributes => attributes,
    save,
    set,
  } as unknown as ProjectSymbolIndexRunModel;
  return { run, save, set };
}

function createSymbolFile(): ProjectSymbolFileModel {
  const attributes: ProjectSymbolFileAttributes = {
    errorCode: null,
    hasSyntaxErrors: false,
    id: symbolFileId,
    language: "typescript",
    omittedSymbolCount: 0,
    parsedAt: new Date("2026-07-27T11:01:00.000Z"),
    parserIdentity: "tree-sitter/typescript/query@1",
    projectId,
    relativePath: "src/main.ts",
    sourceContentHash: "d86d567934dd8e2c168cdb89ea6fd7f048b244452d8c887b73d5941b982719cf",
    sourceFileId,
    status: "parsed",
    symbolCount: 1,
    symbolIndexRunId: symbolIndexId,
  };
  return {
    get: () => attributes,
    id: symbolFileId,
    relativePath: attributes.relativePath,
    sourceFileId,
  } as unknown as ProjectSymbolFileModel;
}

function createSymbol(): ProjectSymbolModel {
  const attributes: ProjectSymbolAttributes = {
    endByte: 26,
    endColumnByte: 26,
    endLine: 0,
    exported: true,
    id: "6953baac-b65a-44a6-91dd-881c2bf8f334",
    identityKey: "a".repeat(64),
    kind: "class",
    name: "ArcService",
    parentIdentityKey: null,
    projectId,
    qualifiedName: "ArcService",
    sourceFileId,
    startByte: 0,
    startColumnByte: 0,
    startLine: 0,
    symbolFileId,
    symbolIndexRunId: symbolIndexId,
  };
  return {
    get: () => attributes,
    id: attributes.id,
    sourceFileId,
  } as unknown as ProjectSymbolModel;
}

function createDatabase(run: ProjectSymbolIndexRunModel) {
  const create = vi.fn(() => Promise.resolve(run));
  const findRun = vi.fn(() => Promise.resolve(run));
  const updateRuns = vi.fn(() => Promise.resolve([0]));
  const bulkCreateFiles = vi.fn(() => Promise.resolve([]));
  const updateFiles = vi.fn(() => Promise.resolve([1]));
  const destroyFiles = vi.fn(() => Promise.resolve(1));
  const findFiles = vi.fn(() => Promise.resolve([createSymbolFile()]));
  const bulkCreateSymbols = vi.fn(() => Promise.resolve([]));
  const findSymbols = vi.fn(() => Promise.resolve([createSymbol()]));
  const updateSymbols = vi.fn(() => Promise.resolve([1]));
  const destroySymbols = vi.fn(() => Promise.resolve(1));
  const transactionValue = { id: "transaction" } as unknown as Transaction;
  const transaction = vi.fn((operation: (transaction: Transaction) => Promise<unknown>) => operation(transactionValue));
  const database = {
    models: {
      chatMessages: {} as ArcDatabase["models"]["chatMessages"],
      chatSessions: {} as ArcDatabase["models"]["chatSessions"],
      projectDependencyBindings: {} as ArcDatabase["models"]["projectDependencyBindings"],
      projectDependencyEdges: {} as ArcDatabase["models"]["projectDependencyEdges"],
      projectDependencyFiles: {} as ArcDatabase["models"]["projectDependencyFiles"],
      projectDependencyIndexRuns: {} as ArcDatabase["models"]["projectDependencyIndexRuns"],
      projectFiles: {} as ArcDatabase["models"]["projectFiles"],
      projects: {} as ArcDatabase["models"]["projects"],
      projectScans: {} as ArcDatabase["models"]["projectScans"],
      projectSourceFiles: {} as ArcDatabase["models"]["projectSourceFiles"],
      projectSourceIndexRuns: {} as ArcDatabase["models"]["projectSourceIndexRuns"],
      projectSymbolFiles: {
        bulkCreate: bulkCreateFiles,
        destroy: destroyFiles,
        findAll: findFiles,
        update: updateFiles,
      } as unknown as ArcDatabase["models"]["projectSymbolFiles"],
      projectSymbolIndexRuns: {
        create,
        findOne: findRun,
        update: updateRuns,
      } as unknown as ArcDatabase["models"]["projectSymbolIndexRuns"],
      projectSymbols: {
        bulkCreate: bulkCreateSymbols,
        destroy: destroySymbols,
        findAll: findSymbols,
        update: updateSymbols,
      } as unknown as ArcDatabase["models"]["projectSymbols"],
    },
    sequelize: { transaction } as unknown as ArcDatabase["sequelize"],
  } satisfies ArcDatabase;

  return {
    bulkCreateFiles,
    bulkCreateSymbols,
    create,
    database,
    destroyFiles,
    destroySymbols,
    findFiles,
    findRun,
    findSymbols,
    transactionValue,
    updateFiles,
    updateRuns,
    updateSymbols,
  };
}

describe("SequelizeProjectSymbolIndexRepository", () => {
  it("creates one running index and maps the partial unique-index conflict", async () => {
    const { run } = createRun();
    const { create, database } = createDatabase(run);
    const repository = new SequelizeProjectSymbolIndexRepository(database);

    await expect(repository.beginIndex(projectId, sourceIndexRunId)).resolves.toMatchObject({
      id: symbolIndexId,
      status: "running",
    });
    expect(create).toHaveBeenCalledWith({ projectId, sourceIndexRunId });

    create.mockRejectedValueOnce(new UniqueConstraintError({ errors: [] }));
    await expect(repository.beginIndex(projectId, sourceIndexRunId)).rejects.toBeInstanceOf(
      ProjectSymbolIndexAlreadyRunningError,
    );
  });

  it("reassigns reusable rows and atomically replaces changed-file symbols", async () => {
    const { run, save, set } = createRun();
    const {
      bulkCreateFiles,
      bulkCreateSymbols,
      database,
      destroyFiles,
      destroySymbols,
      transactionValue,
      updateFiles,
      updateSymbols,
    } = createDatabase(run);
    const repository = new SequelizeProjectSymbolIndexRepository(database);
    const reusedSourceFileId = "83107b40-6495-455f-a557-b64b29ef6af1";

    await expect(
      repository.publishIndex({
        batchSize: 1,
        failedFileCount: 0,
        files: [
          {
            errorCode: null,
            hasSyntaxErrors: false,
            language: "typescript",
            omittedSymbolCount: 0,
            parserIdentity: "tree-sitter/typescript/query@1",
            relativePath: "src/main.ts",
            sourceContentHash: "d86d567934dd8e2c168cdb89ea6fd7f048b244452d8c887b73d5941b982719cf",
            sourceFileId,
            status: "parsed",
            symbolCount: 1,
            symbols: [
              {
                exported: true,
                identityKey: "a".repeat(64),
                kind: "class",
                name: "ArcService",
                parentIdentityKey: null,
                qualifiedName: "ArcService",
                range: {
                  endByte: 26,
                  endColumnByte: 26,
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
        reusedFileCount: 1,
        reusedSourceFileIds: [reusedSourceFileId],
        sourceIndexRunId,
        symbolCount: 2,
        symbolIndexId,
        unsupportedFileCount: 0,
      }),
    ).resolves.toMatchObject({
      parsedFileCount: 1,
      reusedFileCount: 1,
      status: "completed",
      symbolCount: 2,
    });

    expect(updateFiles).toHaveBeenCalledWith(
      { symbolIndexRunId: symbolIndexId },
      expect.objectContaining({
        transaction: transactionValue,
        where: {
          projectId,
          sourceFileId: { [Op.in]: [reusedSourceFileId] },
        },
      }),
    );
    expect(updateSymbols).toHaveBeenCalledWith(
      { symbolIndexRunId: symbolIndexId },
      expect.objectContaining({ transaction: transactionValue }),
    );
    expect(bulkCreateFiles).toHaveBeenCalledWith(
      [expect.objectContaining({ sourceFileId, symbolIndexRunId: symbolIndexId })],
      expect.objectContaining({
        conflictAttributes: ["projectId", "sourceFileId"],
        transaction: transactionValue,
      }),
    );
    expect(bulkCreateSymbols).toHaveBeenCalledWith(
      [expect.objectContaining({ identityKey: "a".repeat(64), symbolFileId, symbolIndexRunId: symbolIndexId })],
      expect.objectContaining({
        conflictAttributes: ["symbolFileId", "identityKey"],
        transaction: transactionValue,
      }),
    );
    expect(destroySymbols).toHaveBeenCalledWith({
      transaction: transactionValue,
      where: {
        projectId,
        symbolIndexRunId: { [Op.ne]: symbolIndexId },
      },
    });
    expect(destroyFiles).toHaveBeenCalledWith({
      transaction: transactionValue,
      where: {
        projectId,
        symbolIndexRunId: { [Op.ne]: symbolIndexId },
      },
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", symbolCount: 2 }));
    expect(save).toHaveBeenCalledWith({ transaction: transactionValue });
  });

  it("rolls back publication when a reusable file disappeared", async () => {
    const { run } = createRun();
    const { database, updateFiles } = createDatabase(run);
    updateFiles.mockResolvedValueOnce([0]);
    const repository = new SequelizeProjectSymbolIndexRepository(database);

    await expect(
      repository.publishIndex({
        batchSize: 10,
        failedFileCount: 0,
        files: [],
        limitReasons: [],
        omittedSymbolCount: 0,
        parsedFileCount: 0,
        projectId,
        reusedFileCount: 1,
        reusedSourceFileIds: [sourceFileId],
        sourceIndexRunId,
        symbolCount: 1,
        symbolIndexId,
        unsupportedFileCount: 0,
      }),
    ).rejects.toThrow("reusable symbol-file state changed");
  });

  it("persists failures, lists current files, and recovers interrupted indexes", async () => {
    const { run } = createRun();
    const { database, updateRuns } = createDatabase(run);
    updateRuns.mockResolvedValueOnce([2]);
    const repository = new SequelizeProjectSymbolIndexRepository(database);

    await expect(
      repository.failIndex({
        errorCode: "symbol_persistence_error",
        projectId,
        symbolIndexId,
      }),
    ).resolves.toMatchObject({
      errorCode: "symbol_persistence_error",
      status: "failed",
    });
    await expect(repository.getCurrentFiles(projectId)).resolves.toEqual([
      expect.objectContaining({
        sourceFileId,
        status: "parsed",
        symbolCount: 1,
      }),
    ]);
    await expect(repository.recoverInterruptedIndexes()).resolves.toBe(2);
    expect(updateRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "index_interrupted",
        status: "failed",
      }),
      { where: { status: "running" } },
    );
  });

  it("reads a paged symbol catalog from one immutable run", async () => {
    const { run } = createRun();
    const { database, findFiles, findSymbols } = createDatabase(run);
    const repository = new SequelizeProjectSymbolIndexRepository(database);

    await expect(
      repository.listCatalogSymbols({
        limit: 10,
        offset: 5,
        projectId,
        sourceFileIds: [sourceFileId],
        symbolIndexId,
      }),
    ).resolves.toEqual({
      hasMore: false,
      symbols: [
        expect.objectContaining({
          id: "6953baac-b65a-44a6-91dd-881c2bf8f334",
          identityKey: "a".repeat(64),
          relativePath: "src/main.ts",
          sourceFileId,
        }),
      ],
    });
    expect(findSymbols).toHaveBeenCalledWith({
      limit: 11,
      offset: 5,
      order: [
        ["sourceFileId", "ASC"],
        ["startByte", "ASC"],
        ["identityKey", "ASC"],
        ["id", "ASC"],
      ],
      where: {
        projectId,
        sourceFileId: { [Op.in]: [sourceFileId] },
        symbolIndexRunId: symbolIndexId,
      },
    });
    expect(findFiles).toHaveBeenCalledWith({
      where: {
        projectId,
        sourceFileId: { [Op.in]: [sourceFileId] },
        symbolIndexRunId: symbolIndexId,
      },
    });
    await expect(
      repository.listCatalogSymbols({
        limit: 10,
        offset: 0,
        projectId,
        sourceFileIds: [],
        symbolIndexId,
      }),
    ).resolves.toEqual({ hasMore: false, symbols: [] });
  });
});
