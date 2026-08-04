import type {
  ExtractSourceSymbolsInput,
  SourceSymbolExtractionResult,
  SourceSymbolLanguage,
} from "../domain/project-symbol-index.types.js";

export interface SourceSymbolExtractor {
  extract(input: ExtractSourceSymbolsInput): SourceSymbolExtractionResult;
  getParserIdentity(language: SourceSymbolLanguage): string;
  supports(language: string): language is SourceSymbolLanguage;
}
