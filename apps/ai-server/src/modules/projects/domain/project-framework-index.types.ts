import type {
  ProjectFrameworkCatalogEntity,
  ProjectFrameworkCatalogRelationship,
  ProjectFrameworkCatalogScope,
  ProjectFrameworkIndex,
  ProjectFrameworkIndexLimitReason,
  ProjectFrameworkIndexWarning,
  ProjectFrameworkEntityKind,
  ProjectFrameworkKind,
} from "@arc/contracts";
import type {
  ProjectFrameworkEntityFact,
  ProjectFrameworkRelationshipFact,
} from "./project-framework-analysis.types.js";
import type {
  ProjectFrameworkScope,
  SourceFrameworkEvidence,
  SourceFrameworkEvidenceOmissionReason,
} from "./project-framework.types.js";

export interface ProjectFrameworkFileOutcome {
  readonly sourceFileId: string;
  readonly scopeKey: string;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly analyzerIdentity: string;
  readonly status: "analyzed" | "analyzed_with_errors" | "unsupported" | "failed" | "limited";
  readonly hasSyntaxErrors: boolean;
  readonly errorCode: string | null;
  readonly evidence: readonly SourceFrameworkEvidence[];
  readonly extractorIdentity: string;
  readonly extractionOmissionCount: number;
  readonly extractionOmissionReasons: readonly SourceFrameworkEvidenceOmissionReason[];
  readonly entities: readonly ProjectFrameworkEntityFact[];
  readonly relationships: readonly ProjectFrameworkRelationshipFact[];
  readonly omissionCount: number;
}
export interface PublishProjectFrameworkIndexInput {
  readonly projectId: string;
  readonly frameworkIndexId: string;
  readonly sourceIndexRunId: string;
  readonly symbolIndexRunId: string;
  readonly dependencyIndexRunId: string;
  readonly scopes: readonly ProjectFrameworkScope[];
  readonly files: readonly ProjectFrameworkFileOutcome[];
  readonly analyzedFileCount: number;
  readonly reusedFileCount: number;
  readonly unsupportedFileCount: number;
  readonly failedFileCount: number;
  readonly limitReasons: readonly ProjectFrameworkIndexLimitReason[];
  readonly warnings: readonly ProjectFrameworkIndexWarning[];
}
export interface BeginProjectFrameworkIndexInput {
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly symbolIndexRunId: string;
  readonly dependencyIndexRunId: string;
  readonly analyzerSetIdentity: string;
}
export interface ReusableProjectFrameworkCatalog {
  readonly run: ProjectFrameworkIndex;
  readonly scopes: readonly ProjectFrameworkScope[];
  readonly files: readonly ProjectFrameworkFileOutcome[];
}
export interface ListProjectFrameworkCatalogInput {
  readonly projectId: string;
  readonly frameworkIndexId: string;
  readonly frameworks: readonly ProjectFrameworkKind[];
  readonly entityKinds: readonly ProjectFrameworkEntityKind[];
  readonly path?: string;
  readonly scopePath?: string;
  readonly includeRelationships: boolean;
  readonly maxEntities: number;
  readonly maxRelationships: number;
}
export interface ProjectFrameworkCatalogRecords {
  readonly scopes: readonly ProjectFrameworkCatalogScope[];
  readonly entities: readonly ProjectFrameworkCatalogEntity[];
  readonly relationships: readonly ProjectFrameworkCatalogRelationship[];
  readonly entityTruncated: boolean;
  readonly relationshipTruncated: boolean;
}
export interface ProjectFrameworkIndexRepository {
  beginIndex(input: BeginProjectFrameworkIndexInput): Promise<ProjectFrameworkIndex>;
  publishIndex(input: PublishProjectFrameworkIndexInput): Promise<ProjectFrameworkIndex>;
  failIndex(
    projectId: string,
    frameworkIndexId: string,
    errorCode: ProjectFrameworkIndex["errorCode"],
  ): Promise<ProjectFrameworkIndex>;
  getLatestRun(projectId: string): Promise<ProjectFrameworkIndex | null>;
  getCurrentCatalogRun(projectId: string): Promise<ProjectFrameworkIndex | null>;
  getCurrentReusableCatalog(projectId: string): Promise<ReusableProjectFrameworkCatalog | null>;
  listCatalog(input: ListProjectFrameworkCatalogInput): Promise<ProjectFrameworkCatalogRecords>;
  recoverInterruptedIndexes(): Promise<number>;
}
