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

export interface CurrentProjectSymbolFile {
  readonly hasSyntaxErrors: boolean;
  readonly omittedSymbolCount: number;
  readonly sourceFileId: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly parserIdentity: string;
  readonly status: ProjectSymbolFileStatus;
  readonly symbolCount: number;
}

export interface ProjectSymbolFileOutcome {
  readonly sourceFileId: string;
  readonly relativePath: string;
  readonly sourceContentHash: string;
  readonly language: string;
  readonly parserIdentity: string;
  readonly status: ProjectSymbolFileStatus;
  readonly hasSyntaxErrors: boolean;
  readonly symbolCount: number;
  readonly omittedSymbolCount: number;
  readonly errorCode: ProjectSymbolFileErrorCode | null;
  readonly symbols: readonly ExtractedSourceSymbol[];
}

export interface PublishProjectSymbolIndexInput {
  readonly batchSize: number;
  readonly failedFileCount: number;
  readonly files: readonly ProjectSymbolFileOutcome[];
  readonly limitReasons: readonly ProjectSymbolIndexLimitReason[];
  readonly omittedSymbolCount: number;
  readonly parsedFileCount: number;
  readonly projectId: string;
  readonly reusedSourceFileIds: readonly string[];
  readonly reusedFileCount: number;
  readonly sourceIndexRunId: string;
  readonly symbolCount: number;
  readonly symbolIndexId: string;
  readonly unsupportedFileCount: number;
}

export interface FailProjectSymbolIndexInput {
  readonly errorCode: ProjectSymbolIndexErrorCode;
  readonly projectId: string;
  readonly symbolIndexId: string;
}
import type {
  ProjectSymbolFileErrorCode,
  ProjectSymbolFileStatus,
  ProjectSymbolIndexErrorCode,
  ProjectSymbolIndexLimitReason,
} from "@arc/contracts";
