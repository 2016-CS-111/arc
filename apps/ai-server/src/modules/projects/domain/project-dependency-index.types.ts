import type {
  ProjectDependencyFileErrorCode,
  ProjectDependencyFileStatus,
  ProjectDependencyIndexErrorCode,
  ProjectDependencyIndexLimitReason,
  ProjectDependencyResolverWarningCode,
} from "@arc/contracts";

import type { ProjectModuleResolution } from "./project-module-resolution.types.js";
import type { SourceCodeRange } from "./source-code.types.js";

export const SOURCE_DEPENDENCY_LANGUAGES = ["javascript", "javascriptreact", "typescript", "typescriptreact"] as const;

export const SOURCE_DEPENDENCY_KINDS = ["static_import", "reexport", "require", "dynamic_import"] as const;

export const SOURCE_DEPENDENCY_BINDING_KINDS = [
  "default",
  "named",
  "namespace",
  "side_effect",
  "import_equals",
  "reexport_named",
  "reexport_all",
  "commonjs_default",
  "commonjs_named",
] as const;

export const SOURCE_DEPENDENCY_OMISSION_REASONS = [
  "invalid_specifier",
  "dependency_limit",
  "specifier_text_limit",
  "binding_limit",
  "binding_text_limit",
] as const;

export type SourceDependencyLanguage = (typeof SOURCE_DEPENDENCY_LANGUAGES)[number];
export type SourceDependencyKind = (typeof SOURCE_DEPENDENCY_KINDS)[number];
export type SourceDependencyBindingKind = (typeof SOURCE_DEPENDENCY_BINDING_KINDS)[number];
export type SourceDependencyOmissionReason = (typeof SOURCE_DEPENDENCY_OMISSION_REASONS)[number];
export type SourceDependencyRange = SourceCodeRange;

export interface ExtractedSourceDependencyBinding {
  readonly bindingKey: string;
  readonly exportedName: string | null;
  readonly importedName: string | null;
  readonly kind: SourceDependencyBindingKind;
  readonly localName: string | null;
  readonly range: SourceDependencyRange | null;
  readonly typeOnly: boolean;
}

export interface ExtractedSourceDependency {
  readonly bindings: readonly ExtractedSourceDependencyBinding[];
  readonly extractionKey: string;
  readonly kind: SourceDependencyKind;
  readonly range: SourceDependencyRange;
  readonly specifier: string;
  readonly specifierRange: SourceDependencyRange;
  readonly typeOnly: boolean;
}

export interface SourceDependencyExtractionLimits {
  readonly maxBindingNameBytes: number;
  readonly maxBindingsPerDependency: number;
  readonly maxDependencies: number;
  readonly maxSpecifierBytes: number;
}

export interface ExtractSourceDependenciesInput {
  readonly language: SourceDependencyLanguage;
  readonly limits: SourceDependencyExtractionLimits;
  readonly source: string;
}

export interface SourceDependencyExtractionResult {
  readonly dependencies: readonly ExtractedSourceDependency[];
  readonly extractorIdentity: string;
  readonly hasSyntaxErrors: boolean;
  readonly omissionReasons: readonly SourceDependencyOmissionReason[];
  readonly omittedBindingCount: number;
  readonly omittedDependencyCount: number;
}

export interface CurrentProjectDependencyFile {
  readonly dependencies: readonly ExtractedSourceDependency[];
  readonly edgeCount: number;
  readonly bindingCount: number;
  readonly errorCode: ProjectDependencyFileErrorCode | null;
  readonly extractedAt: string;
  readonly extractorIdentity: string;
  readonly hasSyntaxErrors: boolean;
  readonly language: string;
  readonly omittedBindingCount: number;
  readonly omittedEdgeCount: number;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly sourceFileId: string;
  readonly status: ProjectDependencyFileStatus;
}

export interface ResolvedProjectDependency extends ExtractedSourceDependency {
  readonly resolution: ProjectModuleResolution;
}

export interface ProjectDependencyFileOutcome {
  readonly bindingCount: number;
  readonly dependencies: readonly ResolvedProjectDependency[];
  readonly edgeCount: number;
  readonly errorCode: ProjectDependencyFileErrorCode | null;
  readonly extractedAt: string;
  readonly extractorIdentity: string;
  readonly hasSyntaxErrors: boolean;
  readonly language: string;
  readonly omittedBindingCount: number;
  readonly omittedEdgeCount: number;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly sourceFileId: string;
  readonly status: ProjectDependencyFileStatus;
}

export interface PublishProjectDependencyIndexInput {
  readonly batchSize: number;
  readonly bindingCount: number;
  readonly builtinEdgeCount: number;
  readonly dependencyIndexId: string;
  readonly edgeCount: number;
  readonly externalEdgeCount: number;
  readonly failedFileCount: number;
  readonly files: readonly ProjectDependencyFileOutcome[];
  readonly limitReasons: readonly ProjectDependencyIndexLimitReason[];
  readonly localEdgeCount: number;
  readonly omittedBindingCount: number;
  readonly omittedEdgeCount: number;
  readonly parsedFileCount: number;
  readonly projectId: string;
  readonly resolutionContextHash: string;
  readonly resolverWarnings: readonly ProjectDependencyResolverWarningCode[];
  readonly reusedFileCount: number;
  readonly sourceIndexRunId: string;
  readonly unresolvedEdgeCount: number;
  readonly unsupportedFileCount: number;
}

export interface FailProjectDependencyIndexInput {
  readonly dependencyIndexId: string;
  readonly errorCode: ProjectDependencyIndexErrorCode;
  readonly projectId: string;
  readonly resolutionContextHash?: string;
  readonly resolverWarnings?: readonly ProjectDependencyResolverWarningCode[];
}
