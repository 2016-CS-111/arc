import type { MemoryRecord, Project } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import type { EmbeddingModelPort } from "../../embeddings/application/embedding-model.port.js";
import type { ProjectRepository } from "../../projects/application/project.repository.js";
import type { MemoryRepository } from "./memory.repository.js";
import { MemoryService } from "./memory.service.js";

const projectId = "c7d0da58-9f18-4d86-89d7-53c372d95472";

describe("MemoryService", () => {
  it("deduplicates an explicit project memory and keeps its embedding local", async () => {
    const repository = new InMemoryMemoryRepository();
    const service = createService(repository);

    const first = await service.create({
      content: "Use Sequelize models and class-based services.",
      kind: "convention",
      projectId,
      scope: "project",
    });
    const duplicate = await service.create({
      confidence: 0.8,
      content: "Use Sequelize models and class-based services.",
      kind: "convention",
      projectId,
      scope: "project",
    });

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.confidence).toBe(0.8);
    expect(repository.records).toHaveLength(1);
    expect(repository.embeddingModels).toEqual(["local-embed"]);
  });

  it("combines pinned and lexical memories when embedding lookup is unavailable", async () => {
    const repository = new InMemoryMemoryRepository([
      createMemory({
        content: "Always use class-based services.",
        id: "00000000-0000-4000-8000-000000000001",
        pinned: true,
      }),
      createMemory({ content: "Use Sequelize for PostgreSQL models.", id: "00000000-0000-4000-8000-000000000002" }),
    ]);
    const service = createService(repository, {
      embed: () => Promise.reject(new Error("Embedding unavailable")),
      getStatus: () => Promise.reject(new Error("Not used")),
    });

    const memories = await service.retrieve(projectId, "Sequelize model conventions");

    expect(memories.map((memory) => memory.id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(repository.touchedIds).toEqual(memories.map((memory) => memory.id));
  });
});

function createService(
  repository: InMemoryMemoryRepository,
  embeddingModel: EmbeddingModelPort = {
    embed: () =>
      Promise.resolve({
        dimensions: 1,
        inputFormat: "plain-v1",
        model: "local-embed",
        provider: "ollama",
        vectors: [[0.1]],
      }),
    getStatus: () => Promise.reject(new Error("Not used")),
  },
): MemoryService {
  const project: Project = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: projectId,
    name: "Fixture",
    rootPath: "/fixture",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const projects: ProjectRepository = {
    findById: () => Promise.resolve(project),
    register: () => Promise.reject(new Error("Not used")),
  };
  return new MemoryService(repository, projects, embeddingModel);
}

class InMemoryMemoryRepository implements MemoryRepository {
  public readonly embeddingModels: string[] = [];
  public readonly records: MemoryRecord[];
  public touchedIds: readonly string[] = [];

  public constructor(records: readonly MemoryRecord[] = []) {
    this.records = [...records];
  }

  public create(input: Parameters<MemoryRepository["create"]>[0]): Promise<MemoryRecord> {
    if (input.embeddingModel !== null) {
      this.embeddingModels.push(input.embeddingModel);
    }
    const memory = createMemory({
      confidence: input.confidence,
      content: input.content,
      id: `00000000-0000-4000-8000-${String(this.records.length + 10).padStart(12, "0")}`,
      kind: input.kind,
      pinned: input.pinned,
      projectId: input.projectId,
      provenance: input.provenance,
      scope: input.scope,
    });
    this.records.push(memory);
    return Promise.resolve(memory);
  }

  public delete(memoryId: string): Promise<boolean> {
    const index = this.records.findIndex((memory) => memory.id === memoryId);
    if (index < 0) {
      return Promise.resolve(false);
    }
    this.records.splice(index, 1);
    return Promise.resolve(true);
  }

  public findByContentHash(input: Parameters<MemoryRepository["findByContentHash"]>[0]): Promise<MemoryRecord | null> {
    return Promise.resolve(
      this.records.find(
        (memory) => memory.kind === input.kind && memory.projectId === input.projectId && memory.scope === input.scope,
      ) ?? null,
    );
  }

  public findById(memoryId: string): Promise<MemoryRecord | null> {
    return Promise.resolve(this.records.find((memory) => memory.id === memoryId) ?? null);
  }

  public list(): Promise<readonly MemoryRecord[]> {
    return Promise.resolve(this.records);
  }

  public searchSemantic(): Promise<readonly MemoryRecord[]> {
    return Promise.resolve([]);
  }

  public searchText(input: Parameters<MemoryRepository["searchText"]>[0]): Promise<readonly MemoryRecord[]> {
    const terms = input.query.toLocaleLowerCase().split(/\s+/u);
    return Promise.resolve(
      this.records.filter((memory) => terms.some((term) => memory.content.toLocaleLowerCase().includes(term))),
    );
  }

  public touch(memoryIds: readonly string[]): Promise<void> {
    this.touchedIds = memoryIds;
    return Promise.resolve();
  }

  public update(memoryId: string, input: Parameters<MemoryRepository["update"]>[1]): Promise<MemoryRecord | null> {
    const index = this.records.findIndex((memory) => memory.id === memoryId);
    if (index < 0) {
      return Promise.resolve(null);
    }
    const current = this.records[index];
    if (current === undefined) {
      return Promise.resolve(null);
    }
    const updated = { ...current, ...input, updatedAt: "2026-01-02T00:00:00.000Z" };
    this.records[index] = updated;
    return Promise.resolve(updated);
  }
}

function createMemory(input: Partial<MemoryRecord> & Pick<MemoryRecord, "content" | "id">): MemoryRecord {
  return {
    confidence: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    kind: "convention",
    pinned: false,
    projectId,
    provenance: "manual",
    scope: "project",
    updatedAt: "2026-01-01T00:00:00.000Z",
    usedAt: null,
    ...input,
  };
}
