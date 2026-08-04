import { createHash } from "node:crypto";

import type {
  CreateMemoryRequest,
  ImportMemoriesRequest,
  ListMemoriesQuery,
  MemoryProvenance,
  MemoryRecord,
  UpdateMemoryRequest,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { EmbeddingModelPort } from "../../embeddings/application/embedding-model.port.js";
import { EMBEDDING_MODEL } from "../../embeddings/embeddings.constants.js";
import type { ProjectRepository } from "../../projects/application/project.repository.js";
import { ProjectNotFoundError } from "../../projects/domain/project.errors.js";
import { PROJECT_REPOSITORY } from "../../projects/projects.constants.js";
import { MEMORY_REPOSITORY } from "../memories.constants.js";
import { MemoryConflictError, MemoryNotFoundError } from "../domain/memory.errors.js";
import type { MemoryRepository, UpdateMemoryRecordInput } from "./memory.repository.js";

const retrievalLimit = 6;
const retrievalCandidateLimit = 24;
const RRF_K = 60;

@Injectable()
export class MemoryService {
  public constructor(
    @Inject(MEMORY_REPOSITORY)
    private readonly memoryRepository: MemoryRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(EMBEDDING_MODEL)
    private readonly embeddingModel: EmbeddingModelPort,
  ) {}

  public async create(input: CreateMemoryRequest, provenance: MemoryProvenance = "manual"): Promise<MemoryRecord> {
    const projectId = await this.resolveProjectId(input.scope, input.projectId);
    const contentHash = hashContent(input.content);
    const existing = await this.memoryRepository.findByContentHash({
      contentHash,
      kind: input.kind,
      projectId,
      scope: input.scope,
    });
    const embedding = await this.createEmbedding(input.content, "document");
    const values = {
      content: input.content,
      contentHash,
      confidence: input.confidence ?? 1,
      embedding: embedding?.vector ?? null,
      embeddingModel: embedding?.model ?? null,
      expiresAt: input.expiresAt === undefined || input.expiresAt === null ? null : new Date(input.expiresAt),
      kind: input.kind,
      pinned: input.pinned ?? false,
      projectId,
      provenance,
      scope: input.scope,
    };
    if (existing === null) {
      return this.memoryRepository.create(values);
    }
    return this.requireUpdated(existing.id, values);
  }

  public async update(memoryId: string, input: UpdateMemoryRequest): Promise<MemoryRecord> {
    const existing = await this.requireMemory(memoryId);
    const content = input.content ?? existing.content;
    const contentChanged = content !== existing.content;
    const embedding = contentChanged ? await this.createEmbedding(content, "document") : undefined;
    return this.requireUpdated(memoryId, {
      ...(input.content === undefined ? {} : { content }),
      ...(contentChanged ? { contentHash: hashContent(content) } : {}),
      ...(embedding === undefined
        ? {}
        : { embedding: embedding?.vector ?? null, embeddingModel: embedding?.model ?? null }),
      ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
      ...(input.expiresAt === undefined
        ? {}
        : { expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt) }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
    });
  }

  public async forget(memoryId: string): Promise<void> {
    if (!(await this.memoryRepository.delete(memoryId))) {
      throw new MemoryNotFoundError(memoryId);
    }
  }

  public list(query: ListMemoriesQuery): Promise<readonly MemoryRecord[]> {
    return this.memoryRepository.list({
      includeExpired: query.includeExpired ?? false,
      limit: query.limit ?? 100,
      projectId: query.projectId,
    });
  }

  public async retrieve(projectId: string | undefined, query: string): Promise<readonly MemoryRecord[]> {
    const input = { includeExpired: false, limit: retrievalCandidateLimit, projectId };
    const pinned = (await this.memoryRepository.list({ ...input, limit: 200 })).filter((memory) => memory.pinned);
    const textMatches = await this.memoryRepository.searchText({ ...input, query });
    let semanticMatches: readonly MemoryRecord[] = [];
    const embedding = await this.createEmbedding(query, "query");
    if (embedding !== null) {
      try {
        semanticMatches = await this.memoryRepository.searchSemantic({ ...input, embedding: embedding.vector });
      } catch {
        semanticMatches = [];
      }
    }
    const selected = rankMemories(pinned, textMatches, semanticMatches).slice(0, retrievalLimit);
    await this.memoryRepository.touch(selected.map((memory) => memory.id));
    return selected;
  }

  public async export(
    query: ListMemoriesQuery,
  ): Promise<{ readonly records: readonly MemoryRecord[]; readonly version: 1 }> {
    return { records: await this.list({ ...query, includeExpired: true, limit: 200 }), version: 1 };
  }

  public async import(input: ImportMemoriesRequest): Promise<readonly MemoryRecord[]> {
    const records: MemoryRecord[] = [];
    for (const record of input.records) {
      records.push(await this.create(record, "import"));
    }
    return records;
  }

  private async requireMemory(memoryId: string): Promise<MemoryRecord> {
    const memory = await this.memoryRepository.findById(memoryId);
    if (memory === null) {
      throw new MemoryNotFoundError(memoryId);
    }
    return memory;
  }

  private async requireUpdated(memoryId: string, input: UpdateMemoryRecordInput): Promise<MemoryRecord> {
    const updated = await this.memoryRepository.update(memoryId, input);
    if (updated === null) {
      throw new MemoryNotFoundError(memoryId);
    }
    return updated;
  }

  private async resolveProjectId(
    scope: CreateMemoryRequest["scope"],
    projectId: string | undefined,
  ): Promise<string | null> {
    if (scope === "user") {
      return null;
    }
    if (projectId === undefined) {
      throw new MemoryConflictError("Project memories require a registered project.");
    }
    if ((await this.projectRepository.findById(projectId)) === null) {
      throw new ProjectNotFoundError(projectId);
    }
    return projectId;
  }

  private async createEmbedding(
    content: string,
    purpose: "document" | "query",
  ): Promise<{ readonly model: string; readonly vector: readonly number[] } | null> {
    try {
      const result = await this.embeddingModel.embed({ inputs: [content], purpose });
      const vector = result.vectors[0];
      return vector === undefined ? null : { model: result.model, vector };
    } catch {
      return null;
    }
  }
}

function hashContent(content: string): string {
  return createHash("sha256").update(content.trim().replace(/\s+/gu, " ").toLocaleLowerCase()).digest("hex");
}

function rankMemories(
  pinned: readonly MemoryRecord[],
  textMatches: readonly MemoryRecord[],
  semanticMatches: readonly MemoryRecord[],
): readonly MemoryRecord[] {
  const records = new Map<string, MemoryRecord>();
  const scores = new Map<string, number>();
  for (const [index, memory] of textMatches.entries()) {
    records.set(memory.id, memory);
    scores.set(memory.id, (scores.get(memory.id) ?? 0) + 1 / (RRF_K + index + 1));
  }
  for (const [index, memory] of semanticMatches.entries()) {
    records.set(memory.id, memory);
    scores.set(memory.id, (scores.get(memory.id) ?? 0) + 1 / (RRF_K + index + 1));
  }
  for (const memory of pinned) {
    records.set(memory.id, memory);
    scores.set(memory.id, (scores.get(memory.id) ?? 0) + 1);
  }
  return [...records.values()].sort(
    (left, right) =>
      (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0) || right.updatedAt.localeCompare(left.updatedAt),
  );
}
