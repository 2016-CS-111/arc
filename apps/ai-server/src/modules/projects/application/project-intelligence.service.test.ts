import { createHash } from "node:crypto";

import type {
  Project,
  ProjectDependencyIndex,
  ProjectFrameworkIndex,
  ProjectSourceIndex,
  ProjectSymbolIndex,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type { ProjectFrameworkIndexRepository } from "../domain/project-framework-index.types.js";
import type { ProjectInventorySnapshot } from "../domain/project-inventory.types.js";
import type { ProjectSourceCatalogSnapshot } from "../domain/project-source-index.types.js";
import type { SourceTextReadInput } from "../domain/project-source-index.types.js";
import { ProjectIntelligenceCatalogStaleError } from "../domain/project.errors.js";
import { ProjectIntelligenceService } from "./project-intelligence.service.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";
import type { SourceTextReader } from "./source-text.reader.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const scanId = "72449150-b7e9-4410-8502-10e221dcdf43";
const sourceIndexRunId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";
const symbolIndexRunId = "bfcd6c71-f627-45cb-b133-65cf2e129f13";
const dependencyIndexRunId = "76e5ee0b-608d-4792-91c5-fd46579e74e4";
const frameworkIndexRunId = "00000000-0000-4000-8000-000000000001";
const jobsFileId = "ac871053-d9f1-4f28-b022-1a18079927bb";
const sqlFileId = "83107b40-6495-455f-a557-b64b29ef6af1";
const documentFileId = "9674cdb0-d2ea-43d7-8d52-e48ebfc931cd";
const modelFileId = "e8cbe9c2-a984-4857-9f49-8ee05189344f";

const sources = {
  "ARCHITECTURE.md": "# Architecture\nThe queue lives in src/jobs.ts.\n",
  "db/schema.sql": "create table tasks (owner_id uuid, foreign key (owner_id) references users(id));\n",
  "src/jobs.ts":
    'import { Queue } from "bullmq";\nclass JobService extends BaseService {}\nconst queue = new Queue("jobs");\nqueue.add("run", {});\n',
};

const project: Project = {
  createdAt: "2026-08-05T08:00:00.000Z",
  id: projectId,
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-08-05T08:00:00.000Z",
};

const sourceRun: ProjectSourceIndex = {
  completedAt: "2026-08-05T09:01:00.000Z",
  errorCode: null,
  id: sourceIndexRunId,
  inspectedBytes: 500,
  inventoryScanId: scanId,
  limitReasons: [],
  projectId,
  readyBytes: 500,
  readyFileCount: 3,
  skippedFileCount: 0,
  startedAt: "2026-08-05T09:00:00.000Z",
  status: "completed",
};

const symbolRun: ProjectSymbolIndex = {
  completedAt: "2026-08-05T10:01:00.000Z",
  errorCode: null,
  failedFileCount: 0,
  id: symbolIndexRunId,
  limitReasons: [],
  omittedSymbolCount: 0,
  parsedFileCount: 1,
  projectId,
  reusedFileCount: 0,
  sourceIndexRunId,
  startedAt: "2026-08-05T10:00:00.000Z",
  status: "completed",
  symbolCount: 1,
  unsupportedFileCount: 0,
};

const dependencyRun: ProjectDependencyIndex = {
  bindingCount: 1,
  builtinEdgeCount: 0,
  completedAt: "2026-08-05T11:01:00.000Z",
  edgeCount: 1,
  errorCode: null,
  externalEdgeCount: 1,
  failedFileCount: 0,
  id: dependencyIndexRunId,
  limitReasons: [],
  localEdgeCount: 0,
  omittedBindingCount: 0,
  omittedEdgeCount: 0,
  parsedFileCount: 1,
  projectId,
  resolutionContextHash: "d".repeat(64),
  resolverWarnings: [],
  reusedFileCount: 0,
  sourceIndexRunId,
  startedAt: "2026-08-05T11:00:00.000Z",
  status: "completed",
  unresolvedEdgeCount: 0,
  unsupportedFileCount: 0,
};

const frameworkRun: ProjectFrameworkIndex = {
  analyzedFileCount: 1,
  analyzerSetIdentity: "a".repeat(64),
  completedAt: "2026-08-05T12:01:00.000Z",
  dependencyIndexRunId,
  entityCount: 2,
  errorCode: null,
  failedFileCount: 0,
  id: frameworkIndexRunId,
  limitReasons: [],
  omissionCount: 0,
  projectId,
  relationshipCount: 1,
  reusedFileCount: 0,
  scopeCount: 1,
  sourceIndexRunId,
  startedAt: "2026-08-05T12:00:00.000Z",
  status: "completed",
  symbolIndexRunId,
  unresolvedRelationshipCount: 0,
  unsupportedFileCount: 0,
  warnings: [],
};

describe("ProjectIntelligenceService", () => {
  it("combines structural, database, operational, and document evidence from one coherent snapshot", async () => {
    const fixture = createFixture();

    const result = await fixture.service.getCatalog(projectId, { kinds: [], maxRecords: 200 });

    expect(result.sourceIndexRunId).toBe(sourceIndexRunId);
    expect(result.frameworkIndexRunId).toBe(frameworkIndexRunId);
    expect(result.records.map((record) => record.kind)).toEqual(
      expect.arrayContaining(["document", "extends", "job", "postgres_foreign_key", "queue", "sequelize_association"]),
    );
    expect(
      result.records.find((record) => record.kind === "document" && record.target?.path === "src/jobs.ts"),
    ).toBeDefined();
    expect(result.records.find((record) => record.kind === "sequelize_association")?.target?.name).toBe("User");
  });

  it("rejects evidence when an indexed file changes before analysis", async () => {
    const fixture = createFixture({ staleSource: true });

    await expect(fixture.service.getCatalog(projectId, { kinds: [], maxRecords: 20 })).rejects.toBeInstanceOf(
      ProjectIntelligenceCatalogStaleError,
    );
  });
});

function createFixture(options: { readonly staleSource?: boolean } = {}) {
  const inventory: ProjectInventorySnapshot = {
    files: Object.entries(sources).map(([path, content]) => ({
      modifiedAt: "2026-08-05T09:00:00.000Z",
      path,
      sizeBytes: Buffer.byteLength(content),
    })),
    scan: {
      completedAt: "2026-08-05T08:01:00.000Z",
      errorCode: null,
      fileCount: 3,
      id: scanId,
      ignoredPathCount: 0,
      limitReasons: [],
      projectId,
      skippedSymlinkCount: 0,
      startedAt: "2026-08-05T08:00:00.000Z",
      status: "completed",
      totalBytes: 500,
    },
  };
  const sourceCatalog: ProjectSourceCatalogSnapshot = {
    files: [
      file(jobsFileId, "src/jobs.ts", "typescript"),
      file(sqlFileId, "db/schema.sql", "sql"),
      file(documentFileId, "ARCHITECTURE.md", "markdown"),
    ],
    run: sourceRun,
  };
  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(project)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const inventoryRepository = {
    beginScan: vi.fn(),
    completeScan: vi.fn(),
    failScan: vi.fn(),
    getCurrentSnapshot: vi.fn(() => Promise.resolve(inventory)),
    getLatestScan: vi.fn(),
    recoverInterruptedScans: vi.fn(),
  } satisfies ProjectInventoryRepository;
  const sourceRepository = {
    beginIndex: vi.fn(),
    completeIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(sourceRun)),
    getCurrentReadyCatalog: vi.fn(() => Promise.resolve(sourceCatalog)),
    getLatestRun: vi.fn(() => Promise.resolve(sourceRun)),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSourceIndexRepository;
  const symbolRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(symbolRun)),
    getCurrentFiles: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(symbolRun)),
    listCatalogSymbols: vi.fn(() =>
      Promise.resolve({
        hasMore: false,
        symbols: [
          {
            exported: true,
            id: "7c6d8e7e-c125-42dd-a5f7-45d066c128fb",
            identityKey: "e".repeat(64),
            kind: "class" as const,
            name: "User",
            parentIdentityKey: null,
            qualifiedName: "User",
            range: range(),
            relativePath: "src/user.ts",
            sourceFileId: modelFileId,
          },
        ],
      }),
    ),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSymbolIndexRepository;
  const dependencyRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    findGraphEdges: vi.fn(),
    findGraphFile: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(dependencyRun)),
    getCurrentFiles: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(dependencyRun)),
    listCatalogDependencies: vi.fn(),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectDependencyIndexRepository;
  const frameworkRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(frameworkRun)),
    getCurrentReusableCatalog: vi.fn(),
    getLatestRun: vi.fn(),
    listCatalog: vi.fn(() => Promise.resolve(sequelizeCatalog())),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectFrameworkIndexRepository;
  const sourceReader = {
    inspect: vi.fn((input: SourceTextReadInput) => {
      const content = sources[input.file.path as keyof typeof sources];
      return Promise.resolve({
        content,
        contentHash: options.staleSource ? "f".repeat(64) : hash(content),
        inspectedBytes: Buffer.byteLength(content),
        modifiedAt: input.file.modifiedAt,
        sizeBytes: input.file.sizeBytes,
        status: "ready" as const,
      });
    }),
  } satisfies SourceTextReader;
  return {
    service: new ProjectIntelligenceService(
      projectRepository,
      inventoryRepository,
      sourceRepository,
      symbolRepository,
      dependencyRepository,
      frameworkRepository,
      sourceReader,
      loadConfig(),
    ),
  };
}

function file(id: string, relativePath: keyof typeof sources, language: string) {
  const content = sources[relativePath];
  return {
    contentHash: hash(content),
    id,
    language,
    modifiedAt: "2026-08-05T09:00:00.000Z",
    relativePath,
    sizeBytes: Buffer.byteLength(content),
  };
}

function sequelizeCatalog() {
  const scopeId = "b4bf0c2a-9d50-4569-906f-7cfa2798f91e";
  const taskId = "90719f02-3837-44d6-a685-20046ed7f3f5";
  const userId = "f3f17938-e99a-4928-9d8c-7247d66ba88f";
  return {
    entities: [
      {
        attributes: {
          kind: "sequelize_model" as const,
          modelName: "Task",
          origin: "class_init" as const,
          tableName: "tasks",
          timestamps: true,
        },
        certainty: "declared" as const,
        entityKind: "model" as const,
        evidenceKind: "class_heritage" as const,
        framework: "sequelize" as const,
        id: taskId,
        identityKey: "a".repeat(64),
        name: "Task",
        path: "src/task.ts",
        range: range(),
        scopeId,
        sourceFileId: modelFileId,
        symbolId: null,
      },
      {
        attributes: {
          kind: "sequelize_model" as const,
          modelName: "User",
          origin: "class_init" as const,
          tableName: "users",
          timestamps: true,
        },
        certainty: "declared" as const,
        entityKind: "model" as const,
        evidenceKind: "class_heritage" as const,
        framework: "sequelize" as const,
        id: userId,
        identityKey: "b".repeat(64),
        name: "User",
        path: "src/user.ts",
        range: range(),
        scopeId,
        sourceFileId: modelFileId,
        symbolId: null,
      },
    ],
    entityTruncated: false,
    relationshipTruncated: false,
    relationships: [
      {
        attributes: {
          association: "belongsTo" as const,
          foreignKey: "ownerId",
          kind: "sequelize_association" as const,
          targetKey: null,
          through: null,
        },
        certainty: "linked" as const,
        dependencyEdgeId: null,
        evidenceKind: "call_expression" as const,
        framework: "sequelize" as const,
        id: "c43264fd-730e-4f5c-92bc-2d1d44c157df",
        identityKey: "c".repeat(64),
        range: range(),
        relationshipKind: "associates" as const,
        scopeId,
        sourceEntityId: taskId,
        sourceFileId: modelFileId,
        symbolId: null,
        targetEntityId: userId,
        targetName: "User",
      },
    ],
    scopes: [
      {
        contextHash: "d".repeat(64),
        framework: "sequelize" as const,
        id: scopeId,
        packageName: null,
        rootPath: ".",
        scopeKey: "e".repeat(64),
      },
    ],
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function range() {
  return { endByte: 12, endColumnByte: 12, endLine: 0, startByte: 0, startColumnByte: 0, startLine: 0 };
}
