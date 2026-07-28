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
