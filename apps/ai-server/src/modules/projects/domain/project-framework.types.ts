import type { SourceCodeRange } from "./source-code.types.js";

export const PROJECT_FRAMEWORK_KINDS = ["nestjs", "express", "nextjs", "react", "sequelize"] as const;

export const SOURCE_FRAMEWORK_EVIDENCE_KINDS = [
  "decorator",
  "call_expression",
  "class_heritage",
  "jsx",
  "directive",
  "constructor_parameter",
] as const;

export const SOURCE_FRAMEWORK_EVIDENCE_OMISSION_REASONS = [
  "evidence_limit",
  "name_text_limit",
  "static_value_limit",
  "static_depth_limit",
  "static_collection_limit",
] as const;

export type ProjectFrameworkKind = (typeof PROJECT_FRAMEWORK_KINDS)[number];
export type SourceFrameworkEvidenceKind = (typeof SOURCE_FRAMEWORK_EVIDENCE_KINDS)[number];
export type SourceFrameworkEvidenceOmissionReason = (typeof SOURCE_FRAMEWORK_EVIDENCE_OMISSION_REASONS)[number];
export type SourceFrameworkLanguage = "javascript" | "javascriptreact" | "typescript" | "typescriptreact";

export interface SourceFrameworkReference {
  readonly segments: readonly string[];
}

export type SourceFrameworkStaticValue =
  | { readonly kind: "array"; readonly items: readonly SourceFrameworkStaticValue[] }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "identifier"; readonly reference: SourceFrameworkReference }
  | { readonly kind: "null" }
  | { readonly kind: "number"; readonly value: number }
  | {
      readonly kind: "object";
      readonly properties: readonly {
        readonly key: string;
        readonly value: SourceFrameworkStaticValue;
      }[];
    }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "unknown" };

export interface SourceFrameworkEvidenceBase {
  readonly evidenceKey: string;
  readonly kind: SourceFrameworkEvidenceKind;
  readonly range: SourceCodeRange;
}

export interface SourceFrameworkDecoratorEvidence extends SourceFrameworkEvidenceBase {
  readonly arguments: readonly SourceFrameworkStaticValue[];
  readonly kind: "decorator";
  readonly memberName: string | null;
  readonly ownerName: string | null;
  readonly parameterIndex: number | null;
  readonly reference: SourceFrameworkReference | null;
  readonly targetKind: "class" | "method" | "property" | "parameter" | "unknown";
  readonly targetName: string | null;
}

export interface SourceFrameworkCallEvidence extends SourceFrameworkEvidenceBase {
  readonly arguments: readonly SourceFrameworkStaticValue[];
  readonly assignedName: string | null;
  readonly inlineHandlerParameterCounts: readonly (number | null)[];
  readonly kind: "call_expression";
  readonly memberName: string | null;
  readonly reference: SourceFrameworkReference | null;
  readonly receiverCall: SourceFrameworkCallReceiver | null;
}

export interface SourceFrameworkCallReceiver {
  readonly arguments: readonly SourceFrameworkStaticValue[];
  readonly reference: SourceFrameworkReference | null;
}

export interface SourceFrameworkClassHeritageEvidence extends SourceFrameworkEvidenceBase {
  readonly className: string | null;
  readonly extendsReference: SourceFrameworkReference | null;
  readonly kind: "class_heritage";
}

export interface SourceFrameworkJsxEvidence extends SourceFrameworkEvidenceBase {
  readonly kind: "jsx";
  readonly tag: SourceFrameworkReference | null;
}

export interface SourceFrameworkDirectiveEvidence extends SourceFrameworkEvidenceBase {
  readonly kind: "directive";
  readonly value: string;
}

export interface SourceFrameworkConstructorParameterEvidence extends SourceFrameworkEvidenceBase {
  readonly kind: "constructor_parameter";
  readonly ownerName: string;
  readonly parameterIndex: number;
  readonly parameterName: string | null;
  readonly typeReference: SourceFrameworkReference | null;
}

export type SourceFrameworkEvidence =
  | SourceFrameworkDecoratorEvidence
  | SourceFrameworkCallEvidence
  | SourceFrameworkClassHeritageEvidence
  | SourceFrameworkConstructorParameterEvidence
  | SourceFrameworkJsxEvidence
  | SourceFrameworkDirectiveEvidence;

export interface SourceFrameworkEvidenceLimits {
  readonly maxCollectionEntries: number;
  readonly maxEvidence: number;
  readonly maxNameBytes: number;
  readonly maxStaticDepth: number;
  readonly maxStaticValueBytes: number;
}

export interface ExtractSourceFrameworkEvidenceInput {
  readonly language: SourceFrameworkLanguage;
  readonly limits: SourceFrameworkEvidenceLimits;
  readonly source: string;
}

export interface SourceFrameworkEvidenceExtractionResult {
  readonly evidence: readonly SourceFrameworkEvidence[];
  readonly extractorIdentity: string;
  readonly hasSyntaxErrors: boolean;
  readonly omissionReasons: readonly SourceFrameworkEvidenceOmissionReason[];
  readonly omittedEvidenceCount: number;
  readonly omittedStaticValueCount: number;
}

export interface ProjectFrameworkPackageMetadata {
  readonly content: string;
  readonly contentHash: string;
  readonly relativePath: string;
  readonly sourceFileId: string;
}

export interface ProjectFrameworkSourceFile {
  readonly relativePath: string;
  readonly sourceFileId: string;
}

export interface ProjectFrameworkDependencyBinding {
  readonly bindingKey: string;
  readonly importedName: string | null;
  readonly kind: string;
  readonly localName: string | null;
  readonly typeOnly: boolean;
}

export interface ProjectFrameworkDependency {
  readonly bindings: readonly ProjectFrameworkDependencyBinding[];
  readonly externalPackage: string | null;
  readonly id: string;
  readonly sourceFileId: string;
  readonly sourceRelativePath: string;
  readonly specifier: string;
  readonly typeOnly: boolean;
}

export interface ProjectFrameworkScopeEvidence {
  readonly dependencyEdgeId: string | null;
  readonly kind: "package_metadata" | "import_binding";
  readonly relativePath: string;
  readonly sourceFileId: string;
}

export interface ProjectFrameworkScope {
  readonly contextHash: string;
  readonly evidence: readonly ProjectFrameworkScopeEvidence[];
  readonly framework: ProjectFrameworkKind;
  readonly packageName: string | null;
  readonly rootPath: string;
  readonly scopeKey: string;
}

export interface ProjectFrameworkFileScope {
  readonly frameworks: readonly ProjectFrameworkKind[];
  readonly rootPath: string;
  readonly scopeKeys: readonly string[];
  readonly sourceFileId: string;
}

export interface ProjectFrameworkScopeWarning {
  readonly code: "package_metadata_invalid";
  readonly relativePath: string;
}

export interface DetectProjectFrameworkScopesInput {
  readonly dependencies: readonly ProjectFrameworkDependency[];
  readonly packageMetadata: readonly ProjectFrameworkPackageMetadata[];
  readonly projectId: string;
  readonly sourceFiles: readonly ProjectFrameworkSourceFile[];
}

export interface ProjectFrameworkScopeDetectionResult {
  readonly fileScopes: readonly ProjectFrameworkFileScope[];
  readonly scopes: readonly ProjectFrameworkScope[];
  readonly warnings: readonly ProjectFrameworkScopeWarning[];
}

export interface ProjectFrameworkImportBinding {
  readonly bindingKey: string;
  readonly dependencyEdgeId: string;
  readonly framework: ProjectFrameworkKind;
  readonly importedName: string;
  readonly localName: string;
  readonly packageName: string;
  readonly sourceFileId: string;
  readonly sourceRelativePath: string;
}
