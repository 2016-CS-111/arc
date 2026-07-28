import type { ProjectSourceIndex } from "@arc/contracts";

import type {
  CompleteProjectSourceIndexInput,
  FailProjectSourceIndexInput,
  ProjectSourceCatalogSnapshot,
} from "../domain/project-source-index.types.js";

export interface ProjectSourceIndexRepository {
  beginIndex(projectId: string, inventoryScanId: string): Promise<ProjectSourceIndex>;
  completeIndex(input: CompleteProjectSourceIndexInput): Promise<ProjectSourceIndex>;
  failIndex(input: FailProjectSourceIndexInput): Promise<ProjectSourceIndex>;
  getCurrentReadyCatalog(projectId: string): Promise<ProjectSourceCatalogSnapshot | null>;
  getCurrentCatalogRun(projectId: string): Promise<ProjectSourceIndex | null>;
  getLatestRun(projectId: string): Promise<ProjectSourceIndex | null>;
  recoverInterruptedIndexes(): Promise<number>;
}
