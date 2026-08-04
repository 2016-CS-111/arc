import type { ProjectSymbolIndex } from "@arc/contracts";

import type {
  CurrentProjectSymbolFile,
  FailProjectSymbolIndexInput,
  ListProjectSymbolCatalogInput,
  ProjectSymbolCatalogPage,
  PublishProjectSymbolIndexInput,
} from "../domain/project-symbol-index.types.js";

export interface ProjectSymbolIndexRepository {
  beginIndex(projectId: string, sourceIndexRunId: string): Promise<ProjectSymbolIndex>;
  publishIndex(input: PublishProjectSymbolIndexInput): Promise<ProjectSymbolIndex>;
  failIndex(input: FailProjectSymbolIndexInput): Promise<ProjectSymbolIndex>;
  getCurrentFiles(projectId: string): Promise<readonly CurrentProjectSymbolFile[]>;
  getCurrentCatalogRun(projectId: string): Promise<ProjectSymbolIndex | null>;
  getLatestRun(projectId: string): Promise<ProjectSymbolIndex | null>;
  listCatalogSymbols(input: ListProjectSymbolCatalogInput): Promise<ProjectSymbolCatalogPage>;
  recoverInterruptedIndexes(): Promise<number>;
}
