import type { ProjectSemanticSearchResult } from "@arc/contracts";

export interface ProjectSemanticSearchQuery {
  readonly projectId: string;
  readonly embeddingIndexId: string;
  readonly embedding: readonly number[];
  readonly pathPrefix?: string;
  readonly languages: readonly string[];
  readonly limit: number;
}

export interface ProjectMetadataSearchQuery {
  readonly projectId: string;
  readonly embeddingIndexId: string;
  readonly query: string;
  readonly pathPrefix?: string;
  readonly languages: readonly string[];
  readonly limit: number;
}

export type ProjectSemanticSearchRecord = Omit<
  ProjectSemanticSearchResult,
  "rank" | "score" | "denseRank" | "denseScore" | "lexicalRank" | "lexicalScore"
> & {
  readonly score: number;
};
