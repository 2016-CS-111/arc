export const SOURCE_SYMBOL_LANGUAGES = ["javascript", "javascriptreact", "typescript", "typescriptreact"] as const;

export const SOURCE_SYMBOL_KINDS = [
  "module",
  "namespace",
  "class",
  "interface",
  "type_alias",
  "enum",
  "function",
  "constructor",
  "method",
  "property",
  "variable",
  "constant",
] as const;

export const SOURCE_SYMBOL_LIMIT_REASONS = ["symbol_limit", "symbol_text_limit"] as const;

export type SourceSymbolLanguage = (typeof SOURCE_SYMBOL_LANGUAGES)[number];
export type SourceSymbolKind = (typeof SOURCE_SYMBOL_KINDS)[number];
export type SourceSymbolLimitReason = (typeof SOURCE_SYMBOL_LIMIT_REASONS)[number];

export interface SourceSymbolRange {
  readonly endByte: number;
  readonly endColumnByte: number;
  readonly endLine: number;
  readonly startByte: number;
  readonly startColumnByte: number;
  readonly startLine: number;
}

export interface ExtractedSourceSymbol {
  readonly exported: boolean;
  readonly identityKey: string;
  readonly kind: SourceSymbolKind;
  readonly name: string;
  readonly parentIdentityKey: string | null;
  readonly qualifiedName: string;
  readonly range: SourceSymbolRange;
}

export interface SourceSymbolExtractionLimits {
  readonly maxNameBytes: number;
  readonly maxQualifiedNameBytes: number;
  readonly maxSymbols: number;
}

export interface ExtractSourceSymbolsInput {
  readonly language: SourceSymbolLanguage;
  readonly limits: SourceSymbolExtractionLimits;
  readonly source: string;
}

export interface SourceSymbolExtractionResult {
  readonly hasSyntaxErrors: boolean;
  readonly limitReasons: readonly SourceSymbolLimitReason[];
  readonly omittedSymbolCount: number;
  readonly parserIdentity: string;
  readonly symbols: readonly ExtractedSourceSymbol[];
}
