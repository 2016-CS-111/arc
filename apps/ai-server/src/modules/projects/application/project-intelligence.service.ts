import { createHash } from "node:crypto";

import ts from "typescript";

import type {
  ProjectFrameworkCatalogEntity,
  ProjectFrameworkCatalogRelationship,
  ProjectIntelligenceCatalogQuery,
  ProjectIntelligenceCatalogResponse,
  ProjectIntelligenceRecord,
  ProjectIntelligenceSourceRange,
} from "@arc/contracts";
import { ProjectIntelligenceCatalogResponseSchema } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import type { ProjectFrameworkIndexRepository } from "../domain/project-framework-index.types.js";
import type { ProjectInventorySnapshot } from "../domain/project-inventory.types.js";
import type { ProjectSourceCatalogSnapshot, ReadyProjectSourceFile } from "../domain/project-source-index.types.js";
import {
  ProjectIntelligenceCatalogQueryFailedError,
  ProjectIntelligenceCatalogRequiredError,
  ProjectIntelligenceCatalogStaleError,
  ProjectNotFoundError,
} from "../domain/project.errors.js";
import {
  PROJECT_DEPENDENCY_INDEX_REPOSITORY,
  PROJECT_FRAMEWORK_INDEX_REPOSITORY,
  PROJECT_INVENTORY_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  PROJECT_SYMBOL_INDEX_REPOSITORY,
  SOURCE_TEXT_READER,
} from "../projects.constants.js";
import {
  TypeScriptProjectIntelligenceExtractor,
  sourceRange,
  type ProjectIntelligenceFinding,
} from "./typescript-project-intelligence.extractor.js";
import type { ProjectDependencyIndexRepository } from "./project-dependency-index.repository.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";
import type { SourceTextReader } from "./source-text.reader.js";

const MAX_ANALYZED_FILES = 500;
const MAX_LINKED_SYMBOLS = 10_000;

interface IntelligenceSnapshot {
  readonly dependencyIndexRunId: string;
  readonly frameworkIndexRunId: string | null;
  readonly inventory: ProjectInventorySnapshot;
  readonly projectRootPath: string;
  readonly sourceCatalog: ProjectSourceCatalogSnapshot;
  readonly symbolIndexRunId: string;
}

interface SymbolTarget {
  readonly name: string;
  readonly path: string;
  readonly sourceFileId: string;
  readonly symbolId: string;
}

@Injectable()
export class ProjectIntelligenceService {
  private readonly extractor = new TypeScriptProjectIntelligenceExtractor();

  public constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_INVENTORY_REPOSITORY) private readonly inventoryRepository: ProjectInventoryRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY) private readonly sourceRepository: ProjectSourceIndexRepository,
    @Inject(PROJECT_SYMBOL_INDEX_REPOSITORY) private readonly symbolRepository: ProjectSymbolIndexRepository,
    @Inject(PROJECT_DEPENDENCY_INDEX_REPOSITORY)
    private readonly dependencyRepository: ProjectDependencyIndexRepository,
    @Inject(PROJECT_FRAMEWORK_INDEX_REPOSITORY)
    private readonly frameworkRepository: ProjectFrameworkIndexRepository,
    @Inject(SOURCE_TEXT_READER) private readonly sourceReader: SourceTextReader,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async getCatalog(
    projectId: string,
    query: ProjectIntelligenceCatalogQuery,
  ): Promise<ProjectIntelligenceCatalogResponse> {
    try {
      const snapshot = await this.loadSnapshot(projectId);
      const symbols = await this.loadSymbols(projectId, snapshot.symbolIndexRunId);
      const sourceFiles = selectSourceFiles(snapshot.sourceCatalog.files, query.pathPrefix);
      const records = await this.readSourceRecords(snapshot, sourceFiles.files, symbols.records);
      const framework = await this.readFrameworkRecords(projectId, snapshot.frameworkIndexRunId);
      const filtered = [...records, ...framework.records]
        .filter((record) => query.kinds.length === 0 || query.kinds.includes(record.kind))
        .sort(compareRecords);
      const response = {
        dependencyIndexRunId: snapshot.dependencyIndexRunId,
        frameworkIndexRunId: snapshot.frameworkIndexRunId,
        projectId,
        records: filtered.slice(0, query.maxRecords),
        sourceIndexRunId: snapshot.sourceCatalog.run.id,
        symbolIndexRunId: snapshot.symbolIndexRunId,
        truncated: {
          files: sourceFiles.truncated,
          records: filtered.length > query.maxRecords || framework.truncated,
          symbols: symbols.truncated,
        },
      };
      await this.assertSnapshotUnchanged(projectId, snapshot);
      return ProjectIntelligenceCatalogResponseSchema.parse(response);
    } catch (error) {
      if (isPublicIntelligenceError(error)) throw error;
      throw new ProjectIntelligenceCatalogQueryFailedError();
    }
  }

  private async loadSnapshot(projectId: string): Promise<IntelligenceSnapshot> {
    const [
      project,
      inventory,
      sourceCatalog,
      symbolRun,
      dependencyRun,
      frameworkRun,
      sourceLatest,
      symbolLatest,
      dependencyLatest,
    ] = await Promise.all([
      this.projectRepository.findById(projectId),
      this.inventoryRepository.getCurrentSnapshot(projectId),
      this.sourceRepository.getCurrentReadyCatalog(projectId),
      this.symbolRepository.getCurrentCatalogRun(projectId),
      this.dependencyRepository.getCurrentCatalogRun(projectId),
      this.frameworkRepository.getCurrentCatalogRun(projectId),
      this.sourceRepository.getLatestRun(projectId),
      this.symbolRepository.getLatestRun(projectId),
      this.dependencyRepository.getLatestRun(projectId),
    ]);
    if (project === null) throw new ProjectNotFoundError(projectId);
    if (sourceCatalog === null || symbolRun === null || dependencyRun === null) {
      throw new ProjectIntelligenceCatalogRequiredError(projectId);
    }
    if (
      sourceCatalog.run.inventoryScanId !== inventory?.scan.id ||
      symbolRun.sourceIndexRunId !== sourceCatalog.run.id ||
      dependencyRun.sourceIndexRunId !== sourceCatalog.run.id ||
      sourceLatest?.status === "running" ||
      symbolLatest?.status === "running" ||
      dependencyLatest?.status === "running"
    ) {
      throw new ProjectIntelligenceCatalogStaleError(projectId);
    }
    const coherentFramework =
      frameworkRun !== null &&
      frameworkRun.sourceIndexRunId === sourceCatalog.run.id &&
      frameworkRun.symbolIndexRunId === symbolRun.id &&
      frameworkRun.dependencyIndexRunId === dependencyRun.id
        ? frameworkRun.id
        : null;
    return {
      dependencyIndexRunId: dependencyRun.id,
      frameworkIndexRunId: coherentFramework,
      inventory,
      projectRootPath: project.rootPath,
      sourceCatalog,
      symbolIndexRunId: symbolRun.id,
    };
  }

  private async loadSymbols(
    projectId: string,
    symbolIndexRunId: string,
  ): Promise<{ readonly records: ReadonlyMap<string, SymbolTarget>; readonly truncated: boolean }> {
    const records = new Map<string, SymbolTarget>();
    let offset = 0;
    let hasMore = true;
    while (hasMore && offset < MAX_LINKED_SYMBOLS) {
      const page = await this.symbolRepository.listCatalogSymbols({
        limit: Math.min(500, MAX_LINKED_SYMBOLS - offset),
        offset,
        projectId,
        symbolIndexId: symbolIndexRunId,
      });
      for (const symbol of page.symbols) {
        if (!records.has(symbol.name)) {
          records.set(symbol.name, {
            name: symbol.qualifiedName,
            path: symbol.relativePath,
            sourceFileId: symbol.sourceFileId,
            symbolId: symbol.id,
          });
        }
      }
      offset += page.symbols.length;
      hasMore = page.hasMore && page.symbols.length > 0;
    }
    return { records, truncated: hasMore };
  }

  private async readSourceRecords(
    snapshot: IntelligenceSnapshot,
    sourceFiles: readonly ReadyProjectSourceFile[],
    symbols: ReadonlyMap<string, SymbolTarget>,
  ): Promise<readonly ProjectIntelligenceRecord[]> {
    const inventoryByPath = new Map(snapshot.inventory.files.map((file) => [file.path, file]));
    const sourcePaths = snapshot.sourceCatalog.files.map((file) => file.relativePath);
    const sourceFilesByPath = new Map(snapshot.sourceCatalog.files.map((file) => [file.relativePath, file]));
    const records: ProjectIntelligenceRecord[] = [];
    for (const sourceFile of sourceFiles) {
      const inventoryFile = inventoryByPath.get(sourceFile.relativePath);
      if (inventoryFile === undefined)
        throw new ProjectIntelligenceCatalogStaleError(snapshot.sourceCatalog.run.projectId);
      const result = await this.sourceReader.inspect({
        file: inventoryFile,
        maxFileBytes: this.config.projectSource.maxFileBytes,
        rootPath: snapshot.projectRootPath,
      });
      if (result.status !== "ready" || result.contentHash !== sourceFile.contentHash) {
        throw new ProjectIntelligenceCatalogStaleError(snapshot.sourceCatalog.run.projectId);
      }
      for (const finding of this.extractor.extract({ language: sourceFile.language, source: result.content })) {
        records.push(toRecord(sourceFile, finding, symbols));
      }
      if (sourceFile.language === "sql") {
        records.push(...extractPostgresRelationships(sourceFile, result.content, symbols));
      }
      if (isProjectDocument(sourceFile.relativePath)) {
        records.push(...extractDocumentRecords(sourceFile, result.content, sourcePaths, sourceFilesByPath, symbols));
      }
    }
    return records;
  }

  private async readFrameworkRecords(
    projectId: string,
    frameworkIndexRunId: string | null,
  ): Promise<{ readonly records: readonly ProjectIntelligenceRecord[]; readonly truncated: boolean }> {
    if (frameworkIndexRunId === null) return { records: [], truncated: false };
    const catalog = await this.frameworkRepository.listCatalog({
      entityKinds: ["model"],
      frameworkIndexId: frameworkIndexRunId,
      frameworks: ["sequelize"],
      includeRelationships: true,
      maxEntities: this.config.projectFramework.catalogMaxEntities,
      maxRelationships: this.config.projectFramework.catalogMaxRelationships,
      projectId,
    });
    const entities = new Map(catalog.entities.map((entity) => [entity.id, entity]));
    const records = catalog.relationships
      .filter((relationship) => relationship.relationshipKind === "associates")
      .map((relationship) => sequelizeAssociationRecord(relationship, entities))
      .filter((record): record is ProjectIntelligenceRecord => record !== null);
    return { records, truncated: catalog.entityTruncated || catalog.relationshipTruncated };
  }

  private async assertSnapshotUnchanged(projectId: string, expected: IntelligenceSnapshot): Promise<void> {
    const current = await this.loadSnapshot(projectId);
    if (
      current.sourceCatalog.run.id !== expected.sourceCatalog.run.id ||
      current.symbolIndexRunId !== expected.symbolIndexRunId ||
      current.dependencyIndexRunId !== expected.dependencyIndexRunId ||
      current.frameworkIndexRunId !== expected.frameworkIndexRunId
    ) {
      throw new ProjectIntelligenceCatalogStaleError(projectId);
    }
  }
}

function selectSourceFiles(
  files: readonly ReadyProjectSourceFile[],
  pathPrefix: string | undefined,
): { readonly files: readonly ReadyProjectSourceFile[]; readonly truncated: boolean } {
  const scoped = files.filter(
    (file) =>
      pathPrefix === undefined || file.relativePath === pathPrefix || file.relativePath.startsWith(`${pathPrefix}/`),
  );
  const prioritized = scoped
    .filter((file) => file.language === "markdown" || file.language === "mdx" || file.language === "sql")
    .concat(
      scoped.filter((file) =>
        ["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(file.language),
      ),
    )
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { files: prioritized.slice(0, MAX_ANALYZED_FILES), truncated: prioritized.length > MAX_ANALYZED_FILES };
}

function toRecord(
  sourceFile: ReadyProjectSourceFile,
  finding: ProjectIntelligenceFinding,
  symbols: ReadonlyMap<string, SymbolTarget>,
): ProjectIntelligenceRecord {
  return createRecord({
    details: [...finding.details],
    evidence: finding.evidence,
    kind: finding.kind,
    name: finding.name,
    path: sourceFile.relativePath,
    range: finding.range,
    sourceFileId: sourceFile.id,
    target: targetFor(finding.targetName, symbols),
  });
}

function extractPostgresRelationships(
  sourceFile: ReadyProjectSourceFile,
  source: string,
  symbols: ReadonlyMap<string, SymbolTarget>,
): readonly ProjectIntelligenceRecord[] {
  const records: ProjectIntelligenceRecord[] = [];
  const pattern = /foreign\s+key\s*\(([^)]+)\)\s+references\s+([a-zA-Z0-9_."-]+)/giu;
  for (const match of source.matchAll(pattern)) {
    const columns = match[1]?.trim();
    const table = match[2]?.replaceAll('"', "").trim();
    if (columns === undefined || table === undefined) continue;
    records.push(
      createRecord({
        details: [{ key: "adapter", value: "postgres" }],
        evidence: clipped(match[0]),
        kind: "postgres_foreign_key",
        name: `${columns} -> ${table}`,
        path: sourceFile.relativePath,
        range: textRange(source, match.index, match.index + match[0].length),
        sourceFileId: sourceFile.id,
        target: targetFor(table, symbols),
      }),
    );
  }
  return records;
}

function extractDocumentRecords(
  sourceFile: ReadyProjectSourceFile,
  source: string,
  sourcePaths: readonly string[],
  sourceFilesByPath: ReadonlyMap<string, ReadyProjectSourceFile>,
  symbols: ReadonlyMap<string, SymbolTarget>,
): readonly ProjectIntelligenceRecord[] {
  const role = sourceFile.relativePath.toLowerCase().includes("readme") ? "readme" : "architecture";
  const records: ProjectIntelligenceRecord[] = [
    createRecord({
      details: [{ key: "role", value: role }],
      evidence: role,
      kind: "document",
      name: sourceFile.relativePath,
      path: sourceFile.relativePath,
      range: textRange(source, 0, Math.min(source.length, 1)),
      sourceFileId: sourceFile.id,
      target: null,
    }),
  ];
  for (const path of sourcePaths
    .filter((candidate) => candidate !== sourceFile.relativePath && source.includes(candidate))
    .slice(0, 10)) {
    const offset = source.indexOf(path);
    records.push(
      createRecord({
        details: [{ key: "role", value: "source_reference" }],
        evidence: path,
        kind: "document",
        name: `${sourceFile.relativePath}: ${path}`,
        path: sourceFile.relativePath,
        range: textRange(source, offset, offset + path.length),
        sourceFileId: sourceFile.id,
        target: targetForPath(path, sourceFilesByPath, symbols),
      }),
    );
  }
  return records;
}

function sequelizeAssociationRecord(
  relationship: ProjectFrameworkCatalogRelationship,
  entities: ReadonlyMap<string, ProjectFrameworkCatalogEntity>,
): ProjectIntelligenceRecord | null {
  const source = entities.get(relationship.sourceEntityId);
  const range = relationship.range ?? source?.range ?? null;
  if (source === undefined || range === null) return null;
  const attributes = relationship.attributes;
  if (attributes.kind !== "sequelize_association") return null;
  const target = relationship.targetEntityId === null ? null : (entities.get(relationship.targetEntityId) ?? null);
  return createRecord({
    details: [
      { key: "adapter", value: "sequelize" },
      { key: "association", value: attributes.association },
      ...(attributes.foreignKey === null ? [] : [{ key: "foreignKey", value: attributes.foreignKey }]),
    ],
    evidence: `${source.name}.${attributes.association}(${relationship.targetName ?? "unknown"})`,
    kind: "sequelize_association",
    name: `${source.name}.${attributes.association}`,
    path: source.path,
    range,
    sourceFileId: source.sourceFileId,
    target:
      target === null
        ? relationship.targetName === null
          ? null
          : { name: clipped(relationship.targetName), path: null, sourceFileId: null, symbolId: null }
        : { name: target.name, path: target.path, sourceFileId: target.sourceFileId, symbolId: target.symbolId },
  });
}

function createRecord(input: Omit<ProjectIntelligenceRecord, "id">): ProjectIntelligenceRecord {
  return {
    ...input,
    id: createHash("sha256")
      .update(JSON.stringify([input.kind, input.path, input.range.startByte, input.name, input.target?.name ?? ""]))
      .digest("hex"),
  };
}

function targetFor(
  targetName: string | null,
  symbols: ReadonlyMap<string, SymbolTarget>,
): ProjectIntelligenceRecord["target"] {
  if (targetName === null) return null;
  const direct = symbols.get(targetName) ?? symbols.get(targetName.split(".").at(-1) ?? "");
  return direct === undefined
    ? { name: clipped(targetName), path: null, sourceFileId: null, symbolId: null }
    : { name: direct.name, path: direct.path, sourceFileId: direct.sourceFileId, symbolId: direct.symbolId };
}

function targetForPath(
  targetPath: string,
  sourceFiles: ReadonlyMap<string, ReadyProjectSourceFile>,
  symbols: ReadonlyMap<string, SymbolTarget>,
): ProjectIntelligenceRecord["target"] {
  const sourceFile = sourceFiles.get(targetPath);
  return sourceFile === undefined
    ? targetFor(targetPath, symbols)
    : { name: targetPath, path: targetPath, sourceFileId: sourceFile.id, symbolId: null };
}

function textRange(source: string, start: number, end: number): ProjectIntelligenceSourceRange {
  const sourceFile = ts.createSourceFile("source.txt", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return sourceRange(source, sourceFile, start, end);
}

function isProjectDocument(relativePath: string): boolean {
  const path = relativePath.toLowerCase();
  return (path.endsWith(".md") || path.endsWith(".mdx")) && (path.includes("readme") || path.includes("architecture"));
}

function compareRecords(left: ProjectIntelligenceRecord, right: ProjectIntelligenceRecord): number {
  return (
    left.path.localeCompare(right.path) ||
    left.range.startByte - right.range.startByte ||
    left.kind.localeCompare(right.kind)
  );
}

function clipped(value: string): string {
  return value.trim().slice(0, 512);
}

function isPublicIntelligenceError(error: unknown): boolean {
  return (
    error instanceof ProjectIntelligenceCatalogQueryFailedError ||
    error instanceof ProjectIntelligenceCatalogRequiredError ||
    error instanceof ProjectIntelligenceCatalogStaleError ||
    error instanceof ProjectNotFoundError
  );
}
