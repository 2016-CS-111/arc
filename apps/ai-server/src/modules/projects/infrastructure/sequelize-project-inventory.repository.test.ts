import { UniqueConstraintError, type Transaction } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import type { ArcDatabase, ProjectScanAttributes } from "../../../database/database.types.js";
import type { ProjectScanModel } from "../../../database/models/project-scan.model.js";
import { ProjectScanAlreadyRunningError } from "../domain/project.errors.js";
import { SequelizeProjectInventoryRepository } from "./sequelize-project-inventory.repository.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const scanId = "72449150-b7e9-4410-8502-10e221dcdf43";
const startedAt = new Date("2026-07-27T09:00:00.000Z");

function createScan(): {
  readonly scan: ProjectScanModel;
  readonly save: ReturnType<typeof vi.fn>;
  readonly set: ReturnType<typeof vi.fn>;
} {
  let attributes: ProjectScanAttributes = {
    completedAt: null,
    errorCode: null,
    fileCount: 0,
    id: scanId,
    ignoredPathCount: 0,
    limitReasons: [],
    projectId,
    skippedSymlinkCount: 0,
    startedAt,
    status: "running",
    totalBytes: "0",
  };
  const save = vi.fn(() => Promise.resolve());
  const set = vi.fn((values: Partial<ProjectScanAttributes>) => {
    attributes = { ...attributes, ...values };
  });
  const scan = {
    get: (): ProjectScanAttributes => attributes,
    save,
    set,
  } as unknown as ProjectScanModel;

  return { save, scan, set };
}

function createDatabase(scan: ProjectScanModel): {
  readonly bulkCreate: ReturnType<typeof vi.fn>;
  readonly create: ReturnType<typeof vi.fn>;
  readonly database: ArcDatabase;
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly findOne: ReturnType<typeof vi.fn>;
  readonly transaction: ReturnType<typeof vi.fn>;
  readonly transactionValue: Transaction;
} {
  const create = vi.fn(() => Promise.resolve(scan));
  const findOne = vi.fn(() => Promise.resolve(scan));
  const destroy = vi.fn(() => Promise.resolve(2));
  const bulkCreate = vi.fn(() => Promise.resolve([]));
  const transactionValue = { id: "transaction" } as unknown as Transaction;
  const transaction = vi.fn((operation: (transaction: Transaction) => Promise<unknown>) => operation(transactionValue));

  return {
    bulkCreate,
    create,
    database: {
      models: {
        chatMessages: {} as ArcDatabase["models"]["chatMessages"],
        chatSessions: {} as ArcDatabase["models"]["chatSessions"],
        projectFiles: { bulkCreate, destroy } as unknown as ArcDatabase["models"]["projectFiles"],
        projects: {} as ArcDatabase["models"]["projects"],
        projectScans: { create, findOne } as unknown as ArcDatabase["models"]["projectScans"],
      },
      sequelize: { transaction } as unknown as ArcDatabase["sequelize"],
    },
    destroy,
    findOne,
    transaction,
    transactionValue,
  };
}

describe("SequelizeProjectInventoryRepository", () => {
  it("creates a durable running scan and maps concurrency conflicts", async () => {
    const { scan } = createScan();
    const { create, database } = createDatabase(scan);
    const repository = new SequelizeProjectInventoryRepository(database);

    await expect(repository.beginScan(projectId)).resolves.toMatchObject({
      id: scanId,
      status: "running",
    });
    expect(create).toHaveBeenCalledWith({ projectId });

    create.mockRejectedValueOnce(new UniqueConstraintError({ errors: [] }));
    await expect(repository.beginScan(projectId)).rejects.toBeInstanceOf(ProjectScanAlreadyRunningError);
  });

  it("replaces inventory in batches and completes the scan in one transaction", async () => {
    const { save, scan, set } = createScan();
    const { bulkCreate, database, destroy, transaction, transactionValue } = createDatabase(scan);
    const repository = new SequelizeProjectInventoryRepository(database);

    await expect(
      repository.completeScan({
        batchSize: 2,
        files: [
          { modifiedAt: "2026-07-27T08:00:00.000Z", path: "a.ts", sizeBytes: 1 },
          { modifiedAt: "2026-07-27T08:00:00.000Z", path: "b.ts", sizeBytes: 2 },
          { modifiedAt: "2026-07-27T08:00:00.000Z", path: "c.ts", sizeBytes: 3 },
        ],
        ignoredPathCount: 4,
        limitReasons: ["file_count"],
        projectId,
        scanId,
        skippedSymlinkCount: 1,
        totalBytes: 6,
      }),
    ).resolves.toMatchObject({
      fileCount: 3,
      limitReasons: ["file_count"],
      status: "limited",
      totalBytes: 6,
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledWith({
      transaction: transactionValue,
      where: { projectId },
    });
    expect(bulkCreate).toHaveBeenCalledTimes(2);
    expect(bulkCreate).toHaveBeenNthCalledWith(
      1,
      [
        expect.objectContaining({ projectId, relativePath: "a.ts", scanId }),
        expect.objectContaining({ projectId, relativePath: "b.ts", scanId }),
      ],
      { transaction: transactionValue },
    );
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ fileCount: 3, status: "limited" }));
    expect(save).toHaveBeenCalledWith({ transaction: transactionValue });
  });

  it("persists stable failure state and returns latest scan status", async () => {
    const { scan } = createScan();
    const { database, findOne } = createDatabase(scan);
    const repository = new SequelizeProjectInventoryRepository(database);

    await expect(
      repository.failScan({
        errorCode: "filesystem_error",
        projectId,
        scanId,
      }),
    ).resolves.toMatchObject({
      errorCode: "filesystem_error",
      status: "failed",
    });
    await expect(repository.getLatestScan(projectId)).resolves.toMatchObject({
      id: scanId,
      status: "failed",
    });
    expect(findOne).toHaveBeenLastCalledWith({
      order: [
        ["startedAt", "DESC"],
        ["id", "DESC"],
      ],
      where: { projectId },
    });
  });
});
