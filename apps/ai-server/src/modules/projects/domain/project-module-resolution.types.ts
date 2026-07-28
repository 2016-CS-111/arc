export const PROJECT_MODULE_RESOLUTION_MODES = ["import", "require"] as const;
export const PROJECT_MODULE_RESOLUTION_KINDS = ["local", "external", "builtin", "unresolved"] as const;
export const PROJECT_MODULE_RESOLUTION_WARNING_CODES = [
  "config_missing",
  "config_invalid",
  "config_extends_missing",
  "config_extends_outside_project",
  "config_extends_cycle",
  "package_metadata_invalid",
] as const;
export const PROJECT_MODULE_UNRESOLVED_REASONS = [
  "not_found",
  "outside_project",
  "not_in_source_catalog",
  "invalid_specifier",
  "unsupported_scheme",
  "unsupported_resolution",
] as const;

export type ProjectModuleResolutionMode = (typeof PROJECT_MODULE_RESOLUTION_MODES)[number];
export type ProjectModuleResolutionKind = (typeof PROJECT_MODULE_RESOLUTION_KINDS)[number];
export type ProjectModuleResolutionWarningCode = (typeof PROJECT_MODULE_RESOLUTION_WARNING_CODES)[number];
export type ProjectModuleUnresolvedReason = (typeof PROJECT_MODULE_UNRESOLVED_REASONS)[number];

export interface ProjectModuleCatalogFile {
  readonly relativePath: string;
  readonly sourceFileId: string;
}

export interface ProjectModuleMetadataFile {
  readonly content: string;
  readonly contentHash: string;
  readonly relativePath: string;
}

export interface PrepareProjectModuleResolverInput {
  readonly files: readonly ProjectModuleCatalogFile[];
  readonly maxMetadataBytes: number;
  readonly metadataFiles: readonly ProjectModuleMetadataFile[];
  readonly rootPath: string;
}

export interface ResolveProjectModuleInput {
  readonly containingRelativePath: string;
  readonly mode: ProjectModuleResolutionMode;
  readonly specifier: string;
}

export interface ProjectModuleResolutionWarning {
  readonly code: ProjectModuleResolutionWarningCode;
  readonly relativePath: string | null;
}

export interface LocalProjectModuleResolution {
  readonly kind: "local";
  readonly targetRelativePath: string;
  readonly targetSourceFileId: string;
}

export interface ExternalProjectModuleResolution {
  readonly kind: "external";
  readonly packageName: string;
}

export interface BuiltinProjectModuleResolution {
  readonly builtinName: string;
  readonly kind: "builtin";
}

export interface UnresolvedProjectModuleResolution {
  readonly kind: "unresolved";
  readonly reason: ProjectModuleUnresolvedReason;
}

export type ProjectModuleResolution =
  | LocalProjectModuleResolution
  | ExternalProjectModuleResolution
  | BuiltinProjectModuleResolution
  | UnresolvedProjectModuleResolution;
