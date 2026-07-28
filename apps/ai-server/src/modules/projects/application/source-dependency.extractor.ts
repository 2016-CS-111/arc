import type {
  ExtractSourceDependenciesInput,
  SourceDependencyExtractionResult,
  SourceDependencyLanguage,
} from "../domain/project-dependency-index.types.js";

export interface SourceDependencyExtractor {
  extract(input: ExtractSourceDependenciesInput): SourceDependencyExtractionResult;
  getExtractorIdentity(language: SourceDependencyLanguage): string;
  supports(language: string): language is SourceDependencyLanguage;
}
