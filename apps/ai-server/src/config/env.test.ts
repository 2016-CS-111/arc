import { describe, expect, it } from "vitest";

import { loadConfig } from "./env.js";

describe("loadConfig", () => {
  it("uses local Ollama defaults without requiring a configured model", () => {
    const config = loadConfig({});

    expect(config.ollama).toEqual({
      baseUrl: "http://127.0.0.1:11434",
      requestTimeoutMs: 300_000,
      readinessTimeoutMs: 5_000,
    });
    expect(config.database).toEqual({
      connectTimeoutMs: 5_000,
      sync: false,
      url: "postgresql://postgres:postgres@127.0.0.1:5432/arc",
    });
    expect(config.chatContext).toEqual({
      contextWindowTokens: 8_192,
      historyTokens: 2_560,
      maxSnippetBytes: 8_192,
      outputReserveTokens: 2_048,
      projectContextTokens: 3_072,
      resultLimit: 12,
    });
    expect(config.tools).toEqual({
      maxCallsPerTurn: 4,
      maxResultChars: 8_192,
      timeoutMs: 10_000,
    });
    expect(config.workspaceTools).toEqual({
      maxEntries: 100,
      maxGitOutputChars: 6_000,
      maxMatches: 40,
      maxReadBytes: 8_192,
      maxSearchFiles: 1_000,
    });
    expect(config.embedding).toEqual({
      dimensions: 1_024,
      timeoutMs: 300_000,
    });
    expect(config.projectEmbedding).toEqual({
      batchSize: 4,
      maxChunksPerFile: 500,
      maxSourceBytes: 8_192,
      maxTotalChunks: 50_000,
    });
    expect(config.projectScan).toEqual({
      batchSize: 500,
      maxDepth: 32,
      maxFiles: 20_000,
      maxTotalBytes: 2_147_483_648,
    });
    expect(config.projectSource).toEqual({
      batchSize: 500,
      maxFileBytes: 1_048_576,
      maxTotalBytes: 268_435_456,
    });
    expect(config.projectSymbol).toEqual({
      batchSize: 500,
      maxNameBytes: 512,
      maxQualifiedNameBytes: 2_048,
      maxSymbolsPerFile: 5_000,
      maxTotalSymbols: 100_000,
      yieldEveryFiles: 25,
    });
    expect(config.projectDependency).toEqual({
      batchSize: 500,
      graphMaxDepth: 5,
      graphMaxEdges: 2_000,
      graphMaxNodes: 500,
      maxBindingNameBytes: 512,
      maxBindingsPerEdge: 100,
      maxConfigBytes: 1_048_576,
      maxEdgesPerFile: 1_000,
      maxSpecifierBytes: 1_024,
      maxTotalBindings: 250_000,
      maxTotalEdges: 100_000,
      yieldEveryFiles: 25,
    });
    expect(config.projectFramework).toEqual({
      batchSize: 500,
      catalogMaxEntities: 500,
      catalogMaxRelationships: 1_000,
      maxCollectionEntries: 100,
      maxEntitiesPerFile: 1_000,
      maxEvidencePerFile: 2_000,
      maxNameBytes: 512,
      maxPackageMetadataBytes: 1_048_576,
      maxRelationshipsPerFile: 2_000,
      maxStaticDepth: 12,
      maxStaticValueBytes: 65_536,
      maxTotalEntities: 100_000,
      maxTotalRelationships: 200_000,
      yieldEveryFiles: 25,
    });
  });

  it("normalizes the Ollama base URL and accepts a configured model", () => {
    const config = loadConfig({
      ARC_OLLAMA_BASE_URL: "http://localhost:11434///",
      ARC_OLLAMA_MODEL: "qwen2.5-coder:3b",
      ARC_OLLAMA_EMBEDDING_DIMENSIONS: "768",
      ARC_OLLAMA_EMBEDDING_MODEL: "bge-m3",
      ARC_OLLAMA_EMBEDDING_TIMEOUT_MS: "90000",
      ARC_PROJECT_EMBEDDING_BATCH_SIZE: "2",
      ARC_PROJECT_EMBEDDING_MAX_CHUNKS_PER_FILE: "25",
      ARC_PROJECT_EMBEDDING_MAX_SOURCE_BYTES: "4096",
      ARC_PROJECT_EMBEDDING_MAX_TOTAL_CHUNKS: "500",
      ARC_OLLAMA_READINESS_TIMEOUT_MS: "2500",
      ARC_OLLAMA_REQUEST_TIMEOUT_MS: "120000",
      ARC_CHAT_CONTEXT_WINDOW_TOKENS: "16384",
      ARC_CHAT_OUTPUT_RESERVE_TOKENS: "4096",
      ARC_CHAT_PROJECT_CONTEXT_TOKENS: "6144",
      ARC_CHAT_HISTORY_TOKENS: "4096",
      ARC_CHAT_CONTEXT_RESULT_LIMIT: "8",
      ARC_CHAT_CONTEXT_MAX_SNIPPET_BYTES: "4096",
      ARC_TOOL_MAX_CALLS_PER_TURN: "3",
      ARC_TOOL_TIMEOUT_MS: "5000",
      ARC_TOOL_MAX_RESULT_CHARS: "4096",
      ARC_WORKSPACE_TOOL_MAX_ENTRIES: "50",
      ARC_WORKSPACE_TOOL_MAX_READ_BYTES: "2048",
      ARC_WORKSPACE_TOOL_MAX_SEARCH_FILES: "250",
      ARC_WORKSPACE_TOOL_MAX_MATCHES: "25",
      ARC_GIT_TOOL_MAX_OUTPUT_CHARS: "3000",
      ARC_DATABASE_CONNECT_TIMEOUT_MS: "8000",
      ARC_DATABASE_SYNC: "true",
      ARC_DATABASE_URL: "postgres://arc:arc@localhost:5433/arc_test",
      ARC_PROJECT_SCAN_BATCH_SIZE: "250",
      ARC_PROJECT_SCAN_MAX_DEPTH: "20",
      ARC_PROJECT_SCAN_MAX_FILES: "5000",
      ARC_PROJECT_SCAN_MAX_TOTAL_BYTES: "104857600",
      ARC_PROJECT_SOURCE_BATCH_SIZE: "100",
      ARC_PROJECT_SOURCE_MAX_FILE_BYTES: "524288",
      ARC_PROJECT_SOURCE_MAX_TOTAL_BYTES: "67108864",
      ARC_PROJECT_SYMBOL_BATCH_SIZE: "200",
      ARC_PROJECT_SYMBOL_MAX_NAME_BYTES: "256",
      ARC_PROJECT_SYMBOL_MAX_QUALIFIED_NAME_BYTES: "1024",
      ARC_PROJECT_SYMBOL_MAX_SYMBOLS_PER_FILE: "2500",
      ARC_PROJECT_SYMBOL_MAX_TOTAL_SYMBOLS: "50000",
      ARC_PROJECT_SYMBOL_YIELD_EVERY_FILES: "10",
      ARC_PROJECT_DEPENDENCY_BATCH_SIZE: "125",
      ARC_PROJECT_DEPENDENCY_GRAPH_MAX_DEPTH: "3",
      ARC_PROJECT_DEPENDENCY_GRAPH_MAX_EDGES: "750",
      ARC_PROJECT_DEPENDENCY_GRAPH_MAX_NODES: "150",
      ARC_PROJECT_DEPENDENCY_MAX_BINDING_NAME_BYTES: "128",
      ARC_PROJECT_DEPENDENCY_MAX_BINDINGS_PER_EDGE: "25",
      ARC_PROJECT_DEPENDENCY_MAX_CONFIG_BYTES: "262144",
      ARC_PROJECT_DEPENDENCY_MAX_EDGES_PER_FILE: "250",
      ARC_PROJECT_DEPENDENCY_MAX_SPECIFIER_BYTES: "256",
      ARC_PROJECT_DEPENDENCY_MAX_TOTAL_BINDINGS: "12500",
      ARC_PROJECT_DEPENDENCY_MAX_TOTAL_EDGES: "5000",
      ARC_PROJECT_DEPENDENCY_YIELD_EVERY_FILES: "5",
      ARC_PROJECT_FRAMEWORK_BATCH_SIZE: "100",
      ARC_PROJECT_FRAMEWORK_CATALOG_MAX_ENTITIES: "250",
      ARC_PROJECT_FRAMEWORK_CATALOG_MAX_RELATIONSHIPS: "750",
      ARC_PROJECT_FRAMEWORK_MAX_COLLECTION_ENTRIES: "20",
      ARC_PROJECT_FRAMEWORK_MAX_ENTITIES_PER_FILE: "200",
      ARC_PROJECT_FRAMEWORK_MAX_EVIDENCE_PER_FILE: "300",
      ARC_PROJECT_FRAMEWORK_MAX_NAME_BYTES: "128",
      ARC_PROJECT_FRAMEWORK_MAX_PACKAGE_METADATA_BYTES: "131072",
      ARC_PROJECT_FRAMEWORK_MAX_RELATIONSHIPS_PER_FILE: "400",
      ARC_PROJECT_FRAMEWORK_MAX_STATIC_DEPTH: "8",
      ARC_PROJECT_FRAMEWORK_MAX_STATIC_VALUE_BYTES: "8192",
      ARC_PROJECT_FRAMEWORK_MAX_TOTAL_ENTITIES: "1000",
      ARC_PROJECT_FRAMEWORK_MAX_TOTAL_RELATIONSHIPS: "2000",
      ARC_PROJECT_FRAMEWORK_YIELD_EVERY_FILES: "4",
    });

    expect(config.ollama).toEqual({
      baseUrl: "http://localhost:11434",
      model: "qwen2.5-coder:3b",
      requestTimeoutMs: 120_000,
      readinessTimeoutMs: 2_500,
    });
    expect(config.database).toEqual({
      connectTimeoutMs: 8_000,
      sync: true,
      url: "postgres://arc:arc@localhost:5433/arc_test",
    });
    expect(config.chatContext).toEqual({
      contextWindowTokens: 16_384,
      historyTokens: 4_096,
      maxSnippetBytes: 4_096,
      outputReserveTokens: 4_096,
      projectContextTokens: 6_144,
      resultLimit: 8,
    });
    expect(config.tools).toEqual({
      maxCallsPerTurn: 3,
      maxResultChars: 4_096,
      timeoutMs: 5_000,
    });
    expect(config.workspaceTools).toEqual({
      maxEntries: 50,
      maxGitOutputChars: 3_000,
      maxMatches: 25,
      maxReadBytes: 2_048,
      maxSearchFiles: 250,
    });
    expect(config.embedding).toEqual({
      dimensions: 768,
      model: "bge-m3",
      timeoutMs: 90_000,
    });
    expect(config.projectEmbedding).toEqual({
      batchSize: 2,
      maxChunksPerFile: 25,
      maxSourceBytes: 4_096,
      maxTotalChunks: 500,
    });
    expect(config.projectScan).toEqual({
      batchSize: 250,
      maxDepth: 20,
      maxFiles: 5_000,
      maxTotalBytes: 104_857_600,
    });
    expect(config.projectSource).toEqual({
      batchSize: 100,
      maxFileBytes: 524_288,
      maxTotalBytes: 67_108_864,
    });
    expect(config.projectSymbol).toEqual({
      batchSize: 200,
      maxNameBytes: 256,
      maxQualifiedNameBytes: 1_024,
      maxSymbolsPerFile: 2_500,
      maxTotalSymbols: 50_000,
      yieldEveryFiles: 10,
    });
    expect(config.projectDependency).toEqual({
      batchSize: 125,
      graphMaxDepth: 3,
      graphMaxEdges: 750,
      graphMaxNodes: 150,
      maxBindingNameBytes: 128,
      maxBindingsPerEdge: 25,
      maxConfigBytes: 262_144,
      maxEdgesPerFile: 250,
      maxSpecifierBytes: 256,
      maxTotalBindings: 12_500,
      maxTotalEdges: 5_000,
      yieldEveryFiles: 5,
    });
    expect(config.projectFramework).toEqual({
      batchSize: 100,
      catalogMaxEntities: 250,
      catalogMaxRelationships: 750,
      maxCollectionEntries: 20,
      maxEntitiesPerFile: 200,
      maxEvidencePerFile: 300,
      maxNameBytes: 128,
      maxPackageMetadataBytes: 131_072,
      maxRelationshipsPerFile: 400,
      maxStaticDepth: 8,
      maxStaticValueBytes: 8_192,
      maxTotalEntities: 1_000,
      maxTotalRelationships: 2_000,
      yieldEveryFiles: 4,
    });
  });

  it("rejects an empty model value", () => {
    expect(() => loadConfig({ ARC_OLLAMA_MODEL: "   " })).toThrow();
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() => loadConfig({ ARC_DATABASE_URL: "mysql://localhost/arc" })).toThrow();
  });

  it("rejects an invalid database sync value", () => {
    expect(() => loadConfig({ ARC_DATABASE_SYNC: "sometimes" })).toThrow();
  });

  it("rejects chat allocations larger than the available input budget", () => {
    expect(() =>
      loadConfig({
        ARC_CHAT_CONTEXT_WINDOW_TOKENS: "4096",
        ARC_CHAT_OUTPUT_RESERVE_TOKENS: "2048",
        ARC_CHAT_PROJECT_CONTEXT_TOKENS: "3072",
      }),
    ).toThrow();
  });
});
