import type { CodeCompletionRequest } from "@arc/contracts";

const MAX_IMPORTS = 20;
const MAX_SYMBOLS = 16;

export interface InlineCompletionContextInput {
  readonly language: string;
  readonly maxPrefixChars: number;
  readonly maxSuffixChars: number;
  readonly maxTokens: number;
  readonly offset: number;
  readonly path: string | null;
  readonly projectId: string | null;
  readonly source: string;
  readonly sourceVersion: number;
}

export function buildInlineCompletionRequest(input: InlineCompletionContextInput): CodeCompletionRequest {
  const nearby = input.source.slice(
    Math.max(0, input.offset - input.maxPrefixChars),
    Math.min(input.source.length, input.offset + input.maxSuffixChars),
  );
  return {
    imports: extractImports(input.source),
    language: input.language,
    maxTokens: input.maxTokens,
    nearbySymbols: extractSymbols(nearby),
    path: input.path,
    prefix: input.source.slice(Math.max(0, input.offset - input.maxPrefixChars), input.offset),
    projectId: input.projectId,
    sourceVersion: input.sourceVersion,
    suffix: input.source.slice(input.offset, Math.min(input.source.length, input.offset + input.maxSuffixChars)),
  };
}

function extractImports(source: string): string[] {
  return source
    .split(/\r?\n/u)
    .filter((line) => /^\s*(?:import\b|export\s+.*\s+from\b|const\s+.*=\s*require\b)/u.test(line))
    .map((line) => line.trim())
    .slice(0, MAX_IMPORTS);
}

function extractSymbols(source: string): string[] {
  const symbols = new Set<string>();
  const pattern = /\b(?:abstract\s+class|class|function|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/gu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) symbols.add(name);
    if (symbols.size === MAX_SYMBOLS) break;
  }
  return [...symbols];
}
