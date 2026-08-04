import type { MemoryKind, MemoryProvenance, MemoryRecord, MemoryScope } from "@arc/contracts";

export interface CreateMemoryRecordInput {
  readonly content: string;
  readonly contentHash: string;
  readonly confidence: number;
  readonly embedding: readonly number[] | null;
  readonly embeddingModel: string | null;
  readonly expiresAt: Date | null;
  readonly kind: MemoryKind;
  readonly pinned: boolean;
  readonly projectId: string | null;
  readonly provenance: MemoryProvenance;
  readonly scope: MemoryScope;
}

export interface UpdateMemoryRecordInput {
  readonly content?: string;
  readonly contentHash?: string;
  readonly confidence?: number;
  readonly embedding?: readonly number[] | null;
  readonly embeddingModel?: string | null;
  readonly expiresAt?: Date | null;
  readonly kind?: MemoryKind;
  readonly pinned?: boolean;
}

export interface MemoryListInput {
  readonly includeExpired: boolean;
  readonly limit: number;
  readonly projectId: string | undefined;
}

export interface MemorySearchInput extends MemoryListInput {
  readonly query: string;
}

export interface SemanticMemorySearchInput extends MemoryListInput {
  readonly embedding: readonly number[];
}

export interface MemoryRepository {
  create(input: CreateMemoryRecordInput): Promise<MemoryRecord>;
  delete(memoryId: string): Promise<boolean>;
  findByContentHash(input: {
    readonly contentHash: string;
    readonly kind: MemoryKind;
    readonly projectId: string | null;
    readonly scope: MemoryScope;
  }): Promise<MemoryRecord | null>;
  findById(memoryId: string): Promise<MemoryRecord | null>;
  list(input: MemoryListInput): Promise<readonly MemoryRecord[]>;
  searchSemantic(input: SemanticMemorySearchInput): Promise<readonly MemoryRecord[]>;
  searchText(input: MemorySearchInput): Promise<readonly MemoryRecord[]>;
  touch(memoryIds: readonly string[]): Promise<void>;
  update(memoryId: string, input: UpdateMemoryRecordInput): Promise<MemoryRecord | null>;
}
