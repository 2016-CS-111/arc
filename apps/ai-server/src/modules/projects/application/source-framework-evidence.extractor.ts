import type {
  ExtractSourceFrameworkEvidenceInput,
  SourceFrameworkEvidenceExtractionResult,
  SourceFrameworkLanguage,
} from "../domain/project-framework.types.js";

export interface SourceFrameworkEvidenceExtractor {
  extract(input: ExtractSourceFrameworkEvidenceInput): SourceFrameworkEvidenceExtractionResult;
  getExtractorIdentity(language: SourceFrameworkLanguage): string;
  supports(language: string): language is SourceFrameworkLanguage;
}
