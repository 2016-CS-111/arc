import type { SourceTextReadInput, SourceTextReadResult } from "../domain/project-source-index.types.js";

export interface SourceTextReader {
  inspect(input: SourceTextReadInput): Promise<SourceTextReadResult>;
}
