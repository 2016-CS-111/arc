import type { ProjectDependencyIndex } from "@arc/contracts";

import type {
  CurrentProjectDependencyFile,
  FailProjectDependencyIndexInput,
  FindProjectDependencyGraphEdgesInput,
  FindProjectDependencyGraphFileInput,
  ProjectDependencyGraphEdgePage,
  ProjectDependencyGraphFileRecord,
  PublishProjectDependencyIndexInput,
} from "../domain/project-dependency-index.types.js";

export interface ProjectDependencyIndexRepository {
  beginIndex(projectId: string, sourceIndexRunId: string): Promise<ProjectDependencyIndex>;
  publishIndex(input: PublishProjectDependencyIndexInput): Promise<ProjectDependencyIndex>;
  failIndex(input: FailProjectDependencyIndexInput): Promise<ProjectDependencyIndex>;
  getCurrentFiles(projectId: string): Promise<readonly CurrentProjectDependencyFile[]>;
  getCurrentCatalogRun(projectId: string): Promise<ProjectDependencyIndex | null>;
  getLatestRun(projectId: string): Promise<ProjectDependencyIndex | null>;
  recoverInterruptedIndexes(): Promise<number>;
  findGraphFile(input: FindProjectDependencyGraphFileInput): Promise<ProjectDependencyGraphFileRecord | null>;
  findGraphEdges(input: FindProjectDependencyGraphEdgesInput): Promise<ProjectDependencyGraphEdgePage>;
}
