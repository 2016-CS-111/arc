import { Op, UniqueConstraintError, type Transaction } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import type { ArcDatabase, ProjectSourceIndexRunAttributes } from "../../../database/database.types.js";
import type { ProjectSourceIndexRunModel } from "../../../database/models/project-source-index-run.model.js";
import { ProjectSourceIndexAlreadyRunningError } from "../domain/project.errors.js";
import { SequelizeProjectSourceIndexRepository } from "./sequelize-project-source-index.repository.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const inventoryScanId = "72449150-b7e9-4410-8502-10e221dcdf43";
const sourceIndexId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";

function createRun() {
  let attributes: ProjectSourceIndexRunAttributes = {
    completedAt: null,
    errorCode: null,
    id: sourceIndexId,
    inspectedBytes: "0",
    inventoryScanId,
    limitReasons: [],
    projectId,
    readyBytes: "0",
    readyFileCount: 0,
    skippedFileCount: 0,
    startedAt: new Date("2026-07-27T10:00:00.000Z"),
    status: "running",
  };
  const save = vi.fn(() => Promise.resolve());
  const set = vi.fn((values: Partial<ProjectSourceIndexRunAttributes>) => {
    attributes = { ...attributes, ...values };
  });
  const run = {
    get: (): ProjectSourceIndexRunAttributes => attributes,
    save,
    set,
  } as unknown as ProjectSourceIndexRunModel;
  return { run, save, set };
}

function createDatabase(run: ProjectSourceIndexRunModel) {
  const create = vi.fn(() => Promise.resolve(run));
  const findOne = vi.fn(() => Promise.resolve(run));
  const update = vi.fn(() => Promise.resolve([0]));
  const bulkCreate = vi.fn(() => Promise.resolve([]));
  const destroy = vi.fn(() => Promise.resolve(1));
  const transactionValue = { id: "transaction" } as unknown as Transaction;
  const transaction = vi.fn((operation: (transaction: Transaction) => Promise<unknown>) => operation(transactionValue));
  const database = {
    models: {
      chatMessages: {} as ArcDatabase["models"]["chatMessages"],
      chatSessions: {} as ArcDatabase["models"]["chatSessions"],
      projectFiles: {} as ArcDatabase["models"]["projectFiles"],
      projects: {} as ArcDatabase["models"]["projects"],
      projectScans: {} as ArcDatabase["models"]["projectScans"],
      projectSourceFiles: { bulkCreate, destroy } as unknown as ArcDatabase["models"]["projectSourceFiles"],
      projectSourceIndexRuns: { create, findOne, update } as unknown as ArcDatabase["models"]["projectSourceIndexRuns"],
    },
    sequelize: { transaction } as unknown as ArcDatabase["sequelize"],
  } satisfies ArcDatabase;

  return { bulkCreate, create, database, destroy, findOne, transaction, transactionValue, update };
}

describe("SequelizeProjectSourceIndexRepository", () => {
  it("creates a running index and maps the partial unique-index conflict", async () => {
    const { run } = createRun();
    const { create, database } = createDatabase(run);
    const repository = new SequelizeProjectSourceIndexRepository(database);

    await expect(repository.beginIndex(projectId, inventoryScanId)).resolves.toMatchObject({
      id: sourceIndexId,
      status: "running",
    });
    expect(create).toHaveBeenCalledWith({ inventoryScanId, projectId });

    create.mockRejectedValueOnce(new UniqueConstraintError({ errors: [] }));
    await expect(repository.beginIndex(projectId, inventoryScanId)).rejects.toBeInstanceOf(
      ProjectSourceIndexAlreadyRunningError,
    );
  });

  it("publishes batches, removes stale paths, and completes one transaction", async () => {
    const { run, save, set } = createRun();
    const { bulkCreate, database, destroy, transactionValue } = createDatabase(run);
    const repository = new SequelizeProjectSourceIndexRepository(database);

    await expect(
      repository.completeIndex({
        batchSize: 1,
        files: [
          {
            contentHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
            inspectedBytes: 5,
            language: "typescript",
            modifiedAt: "2026-07-27T08:30:00.000Z",
            relativePath: "src/main.ts",
            sizeBytes: 5,
            skipReason: null,
            status: "ready",
          },
          {
            contentHash: null,
            inspectedBytes: 0,
            language: null,
            modifiedAt: "2026-07-27T08:30:00.000Z",
            relativePath: "image.bin",
            sizeBytes: 10,
            skipReason: "binary_content",
            status: "skipped",
          },
        ],
        inspectedBytes: 15,
        inventoryScanId,
        limitReasons: ["total_bytes"],
        projectId,
        readyBytes: 5,
        readyFileCount: 1,
        skippedFileCount: 1,
        sourceIndexId,
      }),
    ).resolves.toMatchObject({
      inspectedBytes: 15,
      status: "limited",
    });

    expect(bulkCreate).toHaveBeenCalledTimes(2);
    expect(bulkCreate).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ projectId, relativePath: "src/main.ts", sourceIndexRunId: sourceIndexId })],
      expect.objectContaining({
        conflictAttributes: ["projectId", "relativePath"],
        transaction: transactionValue,
      }),
    );
    expect(destroy).toHaveBeenCalledWith({
      transaction: transactionValue,
      where: {
        projectId,
        sourceIndexRunId: { [Op.ne]: sourceIndexId },
      },
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ readyFileCount: 1, status: "limited" }));
    expect(save).toHaveBeenCalledWith({ transaction: transactionValue });
  });

  it("persists failures and returns latest and current catalog runs", async () => {
    const { run } = createRun();
    const { database, findOne } = createDatabase(run);
    const repository = new SequelizeProjectSourceIndexRepository(database);

    await expect(
      repository.failIndex({
        errorCode: "filesystem_error",
        projectId,
        sourceIndexId,
      }),
    ).resolves.toMatchObject({ errorCode: "filesystem_error", status: "failed" });
    await expect(repository.getLatestRun(projectId)).resolves.toMatchObject({ id: sourceIndexId });
    await expect(repository.getCurrentCatalogRun(projectId)).resolves.toMatchObject({ id: sourceIndexId });
    expect(findOne).toHaveBeenCalledTimes(3);
  });

  it("recovers running indexes after backend restart", async () => {
    const { run } = createRun();
    const { database, update } = createDatabase(run);
    update.mockResolvedValueOnce([2]);
    const repository = new SequelizeProjectSourceIndexRepository(database);

    await expect(repository.recoverInterruptedIndexes()).resolves.toBe(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "index_interrupted",
        status: "failed",
      }),
      { where: { status: "running" } },
    );
  });
});
