import type {
  ProjectFrameworkDependency,
  ProjectFrameworkImportBinding,
  ProjectFrameworkKind,
  SourceFrameworkEvidence,
  SourceFrameworkEvidenceKind,
} from "./project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "./project-symbol-index.types.js";
import type { SourceCodeRange } from "./source-code.types.js";

export const PROJECT_FRAMEWORK_ENTITY_KINDS = [
  "module",
  "controller",
  "provider",
  "application",
  "router",
  "route",
  "middleware",
  "page",
  "layout",
  "route_handler",
  "component",
  "model",
  "model_attribute",
] as const;

export const PROJECT_FRAMEWORK_RELATIONSHIP_KINDS = [
  "contains",
  "registers_controller",
  "registers_provider",
  "imports_module",
  "exports_provider",
  "injects",
  "handles_route",
  "mounts_router",
  "uses_middleware",
  "renders_component",
  "defines_attribute",
  "associates",
  "wraps",
] as const;

export const PROJECT_FRAMEWORK_CERTAINTIES = ["declared", "convention", "linked", "unresolved"] as const;

export const PROJECT_FRAMEWORK_ANALYSIS_OMISSION_REASONS = [
  "entity_limit",
  "relationship_limit",
  "name_text_limit",
  "dynamic_value",
] as const;

export type ProjectFrameworkEntityKind = (typeof PROJECT_FRAMEWORK_ENTITY_KINDS)[number];
export type ProjectFrameworkRelationshipKind = (typeof PROJECT_FRAMEWORK_RELATIONSHIP_KINDS)[number];
export type ProjectFrameworkCertainty = (typeof PROJECT_FRAMEWORK_CERTAINTIES)[number];
export type ProjectFrameworkAnalysisOmissionReason = (typeof PROJECT_FRAMEWORK_ANALYSIS_OMISSION_REASONS)[number];
export type ProjectFrameworkEvidenceKind =
  SourceFrameworkEvidenceKind | "package_metadata" | "import_binding" | "file_convention" | "catalog_link";

export interface NestModuleEntityAttributes {
  readonly dynamicMetadata: boolean;
  readonly kind: "nest_module";
}

export interface NestControllerEntityAttributes {
  readonly dynamicPath: boolean;
  readonly kind: "nest_controller";
  readonly paths: readonly string[];
}

export interface NestProviderEntityAttributes {
  readonly kind: "nest_provider";
  readonly origin: "injectable" | "module_registration";
  readonly token: string;
  readonly useClass: string | null;
}

export interface NestRouteEntityAttributes {
  readonly controllerName: string;
  readonly controllerPaths: readonly string[];
  readonly dynamicPath: boolean;
  readonly fullPaths: readonly string[];
  readonly handlerName: string;
  readonly httpMethod: "ALL" | "DELETE" | "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";
  readonly kind: "nest_route";
  readonly methodPaths: readonly string[];
}

export type ProjectFrameworkEntityAttributes =
  | NestModuleEntityAttributes
  | NestControllerEntityAttributes
  | NestProviderEntityAttributes
  | NestRouteEntityAttributes;

export interface ProjectFrameworkEntityFact {
  readonly attributes: ProjectFrameworkEntityAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly entityKind: ProjectFrameworkEntityKind;
  readonly evidenceKey: string;
  readonly evidenceKind: ProjectFrameworkEvidenceKind;
  readonly framework: ProjectFrameworkKind;
  readonly identityKey: string;
  readonly name: string;
  readonly range: SourceCodeRange | null;
  readonly relativePath: string;
  readonly scopeKey: string;
  readonly sourceFileId: string;
  readonly symbolId: string | null;
}

export interface NestModuleRegistrationRelationshipAttributes {
  readonly kind: "nest_module_registration";
  readonly section: "controllers" | "exports" | "imports" | "providers";
}

export interface NestRouteOwnershipRelationshipAttributes {
  readonly httpMethod: NestRouteEntityAttributes["httpMethod"];
  readonly kind: "nest_route_ownership";
}

export interface NestInjectionRelationshipAttributes {
  readonly kind: "nest_injection";
  readonly parameterIndex: number | null;
  readonly parameterName: string | null;
  readonly tokenKind: "identifier" | "string" | "unknown";
}

export type ProjectFrameworkRelationshipAttributes =
  | NestInjectionRelationshipAttributes
  | NestModuleRegistrationRelationshipAttributes
  | NestRouteOwnershipRelationshipAttributes;

export interface ProjectFrameworkRelationshipFact {
  readonly attributes: ProjectFrameworkRelationshipAttributes;
  readonly certainty: ProjectFrameworkCertainty;
  readonly dependencyEdgeId: string | null;
  readonly evidenceKey: string;
  readonly evidenceKind: ProjectFrameworkEvidenceKind;
  readonly framework: ProjectFrameworkKind;
  readonly identityKey: string;
  readonly range: SourceCodeRange | null;
  readonly relationshipKind: ProjectFrameworkRelationshipKind;
  readonly sourceEntityIdentityKey: string;
  readonly sourceFileId: string;
  readonly symbolId: string | null;
  readonly targetEntityIdentityKey: string | null;
  readonly targetName: string | null;
}

export interface ProjectFrameworkAnalysisOmission {
  readonly evidenceKey: string;
  readonly reason: ProjectFrameworkAnalysisOmissionReason;
}

export interface ProjectFrameworkAnalyzerLimits {
  readonly maxEntities: number;
  readonly maxNameBytes: number;
  readonly maxRelationships: number;
}

export interface AnalyzeProjectFrameworkFileInput {
  readonly dependencies: readonly ProjectFrameworkDependency[];
  readonly evidence: readonly SourceFrameworkEvidence[];
  readonly importBindings: readonly ProjectFrameworkImportBinding[];
  readonly limits: ProjectFrameworkAnalyzerLimits;
  readonly relativePath: string;
  readonly scopeKey: string;
  readonly sourceFileId: string;
  readonly symbols: readonly ProjectSymbolCatalogRecord[];
}

export interface ProjectFrameworkAnalysisResult {
  readonly analyzerIdentity: string;
  readonly entities: readonly ProjectFrameworkEntityFact[];
  readonly omissions: readonly ProjectFrameworkAnalysisOmission[];
  readonly relationships: readonly ProjectFrameworkRelationshipFact[];
}
