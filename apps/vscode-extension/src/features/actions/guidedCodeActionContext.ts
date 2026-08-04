import type { GuidedCodeActionKind, GuidedCodeActionRequest } from "@arc/contracts";

const maxSourceChars = 24_000;

export interface GuidedCodeActionContextInput {
  readonly action: GuidedCodeActionKind;
  readonly diagnostic: string | undefined;
  readonly language: string;
  readonly path: string;
  readonly projectId: string;
  readonly range: { readonly end: Position; readonly start: Position } | undefined;
  readonly requestId: string;
  readonly source: string;
  readonly sourceVersion: number;
}

export interface Position {
  readonly character: number;
  readonly line: number;
}

export function buildGuidedCodeActionRequest(input: GuidedCodeActionContextInput): GuidedCodeActionRequest {
  return {
    action: input.action,
    diagnostic: input.diagnostic ?? null,
    language: input.language,
    path: input.path,
    projectId: input.projectId,
    range: input.range ?? null,
    requestId: input.requestId,
    source: input.source.slice(0, maxSourceChars),
    sourceVersion: input.sourceVersion,
  };
}
