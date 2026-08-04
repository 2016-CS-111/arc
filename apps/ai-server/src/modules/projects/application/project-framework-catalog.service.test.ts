import type {
  Project,
  ProjectDependencyIndex,
  ProjectFrameworkCatalogQuery,
  ProjectFrameworkIndex,
  ProjectSourceIndex,
  ProjectSymbolIndex,
} from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/env.js";
import type { ProjectFrameworkIndexRepository } from "../domain/project-framework-index.types.js";
import {
  InvalidProjectPathError,
  ProjectFrameworkCatalogQueryFailedError,
  ProjectFrameworkCatalogRequiredError,
  ProjectFrameworkCatalogStaleError,
  ProjectNotFoundError,
} from "../domain/project.errors.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import { ProjectFrameworkCatalogService } from "./project-framework-catalog.service.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";

const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";
const sourceIndexRunId = "5a60683c-ded9-43fa-bac8-9ba698430d0e";
const symbolIndexRunId = "bfcd6c71-f627-45cb-b133-65cf2e129f13";
const dependencyIndexRunId = "76e5ee0b-608d-4792-91c5-fd46579e74e4";
const frameworkIndexRunId = "00000000-0000-4000-8000-000000000001";
const scopeId = "b4bf0c2a-9d50-4569-906f-7cfa2798f91e";
const entityId = "90719f02-3837-44d6-a685-20046ed7f3f5";

const project: Project = {
  createdAt: "2026-07-29T08:00:00.000Z",
  id: projectId,
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-29T08:00:00.000Z",
};

const sourceRun: ProjectSourceIndex = {
  completedAt: "2026-07-29T09:01:00.000Z",
  errorCode: null,
  id: sourceIndexRunId,
  inspectedBytes: 100,
  inventoryScanId: "72449150-b7e9-4410-8502-10e221dcdf43",
  limitReasons: [],
  projectId,
  readyBytes: 100,
  readyFileCount: 1,
  skippedFileCount: 0,
  startedAt: "2026-07-29T09:00:00.000Z",
  status: "completed",
};

const symbolRun: ProjectSymbolIndex = {
  completedAt: "2026-07-29T10:01:00.000Z",
  errorCode: null,
  failedFileCount: 0,
  id: symbolIndexRunId,
  limitReasons: [],
  omittedSymbolCount: 0,
  parsedFileCount: 1,
  projectId,
  reusedFileCount: 0,
  sourceIndexRunId,
  startedAt: "2026-07-29T10:00:00.000Z",
  status: "completed",
  symbolCount: 1,
  unsupportedFileCount: 0,
};

const dependencyRun: ProjectDependencyIndex = {
  bindingCount: 1,
  builtinEdgeCount: 0,
  completedAt: "2026-07-29T11:01:00.000Z",
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
  startedAt: "2026-07-29T11:00:00.000Z",
  status: "completed",
  unresolvedEdgeCount: 0,
  unsupportedFileCount: 0,
};

const frameworkRun: ProjectFrameworkIndex = {
  analyzedFileCount: 1,
  analyzerSetIdentity: "a".repeat(64),
  completedAt: "2026-07-29T12:01:00.000Z",
  dependencyIndexRunId,
  entityCount: 1,
  errorCode: null,
  failedFileCount: 0,
  id: frameworkIndexRunId,
  limitReasons: [],
  omissionCount: 0,
  projectId,
  relationshipCount: 0,
  reusedFileCount: 0,
  scopeCount: 1,
  sourceIndexRunId,
  startedAt: "2026-07-29T12:00:00.000Z",
  status: "completed",
  symbolIndexRunId,
  unresolvedRelationshipCount: 0,
  unsupportedFileCount: 0,
  warnings: [],
};

const query: ProjectFrameworkCatalogQuery = {
  framework: ["express"],
  includeRelations: true,
  kind: ["application"],
  maxEntities: 100,
  maxRelationships: 200,
  path: "src\\main.ts",
  scope: ".",
};

function createFixture(options: { readonly projectResult?: Project | null; readonly framework?: boolean } = {}) {
  let selectedFrameworkRun = options.framework === false ? null : frameworkRun;
  let selectedFrameworkLatest = selectedFrameworkRun;
  let selectedSourceRun: ProjectSourceIndex | null = sourceRun;
  let selectedSymbolRun: ProjectSymbolIndex | null = symbolRun;
  let selectedDependencyRun: ProjectDependencyIndex | null = dependencyRun;
  const projectRepository = {
    findById: vi.fn(() => Promise.resolve(options.projectResult === undefined ? project : options.projectResult)),
    register: vi.fn(),
  } satisfies ProjectRepository;
  const sourceRepository = {
    beginIndex: vi.fn(),
    completeIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(selectedSourceRun)),
    getCurrentReadyCatalog: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(selectedSourceRun)),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSourceIndexRepository;
  const symbolRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(selectedSymbolRun)),
    getCurrentFiles: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(selectedSymbolRun)),
    listCatalogSymbols: vi.fn(),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectSymbolIndexRepository;
  const dependencyRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    findGraphEdges: vi.fn(),
    findGraphFile: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(selectedDependencyRun)),
    getCurrentFiles: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(selectedDependencyRun)),
    listCatalogDependencies: vi.fn(),
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectDependencyIndexRepository;
  const listCatalog = vi.fn(() =>
    Promise.resolve({
      entities: [
        {
          attributes: { kind: "express_application" as const, localName: "app" },
          certainty: "declared" as const,
          entityKind: "application" as const,
          evidenceKind: "call_expression" as const,
          framework: "express" as const,
          id: entityId,
          identityKey: "c".repeat(64),
          name: "app",
          path: "src/main.ts",
          range: null,
          scopeId,
          sourceFileId: "83107b40-6495-455f-a557-b64b29ef6af1",
          symbolId: null,
        },
      ],
      entityTruncated: false,
      relationships: [],
      relationshipTruncated: false,
      scopes: [
        {
          contextHash: "b".repeat(64),
          framework: "express" as const,
          id: scopeId,
          packageName: "arc-api",
          rootPath: ".",
          scopeKey: "d".repeat(64),
        },
      ],
    }),
  );
  const frameworkRepository = {
    beginIndex: vi.fn(),
    failIndex: vi.fn(),
    getCurrentCatalogRun: vi.fn(() => Promise.resolve(selectedFrameworkRun)),
    getCurrentReusableCatalog: vi.fn(),
    getLatestRun: vi.fn(() => Promise.resolve(selectedFrameworkLatest)),
    listCatalog,
    publishIndex: vi.fn(),
    recoverInterruptedIndexes: vi.fn(),
  } satisfies ProjectFrameworkIndexRepository;
  const service = new ProjectFrameworkCatalogService(
    projectRepository,
    sourceRepository,
    symbolRepository,
    dependencyRepository,
    frameworkRepository,
    new ProjectPathNormalizer(),
    loadConfig({
      ARC_PROJECT_FRAMEWORK_CATALOG_MAX_ENTITIES: "25",
      ARC_PROJECT_FRAMEWORK_CATALOG_MAX_RELATIONSHIPS: "50",
    }),
  );
  return {
    frameworkRepository,
    listCatalog,
    service,
    setDependencyRun: (value: ProjectDependencyIndex | null) => {
      selectedDependencyRun = value;
    },
    setFrameworkLatest: (value: ProjectFrameworkIndex | null) => {
      selectedFrameworkLatest = value;
    },
    setFrameworkRun: (value: ProjectFrameworkIndex | null) => {
      selectedFrameworkRun = value;
    },
    setSourceRun: (value: ProjectSourceIndex | null) => {
      selectedSourceRun = value;
    },
    setSymbolRun: (value: ProjectSymbolIndex | null) => {
      selectedSymbolRun = value;
    },
  };
}

describe("ProjectFrameworkCatalogService", () => {
  it("normalizes filters, applies server ceilings, and returns bounded durable facts", async () => {
    const fixture = createFixture();

    await expect(fixture.service.getCatalog(projectId, query)).resolves.toMatchObject({
      entities: [{ name: "app", path: "src/main.ts" }],
      frameworkIndex: { id: frameworkIndexRunId },
      relationships: [],
      scopes: [{ rootPath: "." }],
      truncated: { entities: false, relationships: false },
    });
    expect(fixture.listCatalog).toHaveBeenCalledWith({
      entityKinds: ["application"],
      frameworkIndexId: frameworkIndexRunId,
      frameworks: ["express"],
      includeRelationships: true,
      maxEntities: 25,
      maxRelationships: 50,
      path: "src/main.ts",
      projectId,
      scopePath: ".",
    });
  });

  it("returns an empty valid result instead of treating it as missing", async () => {
    const fixture = createFixture();
    fixture.listCatalog.mockResolvedValueOnce({
      entities: [],
      entityTruncated: false,
      relationships: [],
      relationshipTruncated: false,
      scopes: [],
    });

    await expect(
      fixture.service.getCatalog(projectId, { ...query, framework: ["sequelize"], kind: ["model"] }),
    ).resolves.toMatchObject({ entities: [], relationships: [], scopes: [] });
  });

  it("rejects unknown projects and missing or stale framework catalogs", async () => {
    const unknown = createFixture({ projectResult: null });
    await expect(unknown.service.getCatalog(projectId, query)).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(unknown.listCatalog).not.toHaveBeenCalled();

    const missing = createFixture({ framework: false });
    await expect(missing.service.getCatalog(projectId, query)).rejects.toBeInstanceOf(
      ProjectFrameworkCatalogRequiredError,
    );
    expect(missing.listCatalog).not.toHaveBeenCalled();

    const stale = createFixture();
    stale.setDependencyRun({ ...dependencyRun, id: "4f2fdaae-1b31-4484-9f0f-228912714432" });
    await expect(stale.service.getCatalog(projectId, query)).rejects.toBeInstanceOf(ProjectFrameworkCatalogStaleError);
    expect(stale.listCatalog).not.toHaveBeenCalled();
  });

  it("rejects a catalog replaced during the bounded read", async () => {
    const fixture = createFixture();
    fixture.listCatalog.mockImplementationOnce(() => {
      fixture.setFrameworkRun({
        ...frameworkRun,
        id: "1365fe40-cf45-4294-8e23-2efc09eb726c",
      });
      return Promise.resolve({
        entities: [],
        entityTruncated: false,
        relationships: [],
        relationshipTruncated: false,
        scopes: [],
      });
    });

    await expect(fixture.service.getCatalog(projectId, query)).rejects.toBeInstanceOf(
      ProjectFrameworkCatalogStaleError,
    );
  });

  it("keeps invalid paths public and hides repository failures", async () => {
    const invalid = createFixture();
    await expect(invalid.service.getCatalog(projectId, { ...query, path: "../secret.ts" })).rejects.toBeInstanceOf(
      InvalidProjectPathError,
    );

    const failed = createFixture();
    failed.listCatalog.mockRejectedValueOnce(new Error("relation project_framework_entities does not exist"));
    await expect(failed.service.getCatalog(projectId, query)).rejects.toBeInstanceOf(
      ProjectFrameworkCatalogQueryFailedError,
    );
  });
});
