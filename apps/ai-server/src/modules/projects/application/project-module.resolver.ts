import type {
  PrepareProjectModuleResolverInput,
  ProjectModuleResolution,
  ProjectModuleResolutionWarning,
  ResolveProjectModuleInput,
} from "../domain/project-module-resolution.types.js";

export interface PreparedProjectModuleResolver {
  readonly resolutionContextHash: string;
  readonly resolverIdentity: string;
  readonly warnings: readonly ProjectModuleResolutionWarning[];
  resolve(input: ResolveProjectModuleInput): ProjectModuleResolution;
}

export interface ProjectModuleResolver {
  prepare(input: PrepareProjectModuleResolverInput): PreparedProjectModuleResolver;
}
