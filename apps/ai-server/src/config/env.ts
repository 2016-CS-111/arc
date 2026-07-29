import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

loadDotenv({ path: resolve(workspaceRoot, ".env"), quiet: true });

const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "ARC_DATABASE_URL must use the postgres or postgresql protocol.");

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ARC_SERVER_HOST: z.string().min(1).default("127.0.0.1"),
  ARC_SERVER_PORT: z.coerce.number().int().positive().max(65535).default(7331),
  ARC_CORS_ORIGIN: z.string().min(1).default("*"),
  ARC_DATABASE_URL: databaseUrlSchema.default("postgresql://postgres:postgres@127.0.0.1:5432/arc"),
  ARC_DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
  ARC_DATABASE_SYNC: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ARC_OLLAMA_BASE_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, ""))
    .default("http://127.0.0.1:11434"),
  ARC_OLLAMA_MODEL: z.string().trim().min(1).optional(),
  ARC_OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(900_000).default(300_000),
  ARC_OLLAMA_READINESS_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
  ARC_OLLAMA_EMBEDDING_MODEL: z.string().trim().min(1).optional(),
  ARC_OLLAMA_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1_024),
  ARC_OLLAMA_EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  ARC_PROJECT_SCAN_MAX_FILES: z.coerce.number().int().positive().max(100_000).default(20_000),
  ARC_PROJECT_SCAN_MAX_TOTAL_BYTES: z.coerce.number().int().positive().max(1_099_511_627_776).default(2_147_483_648),
  ARC_PROJECT_SCAN_MAX_DEPTH: z.coerce.number().int().positive().max(100).default(32),
  ARC_PROJECT_SCAN_BATCH_SIZE: z.coerce.number().int().positive().max(2_000).default(500),
  ARC_PROJECT_SOURCE_MAX_FILE_BYTES: z.coerce.number().int().positive().max(52_428_800).default(1_048_576),
  ARC_PROJECT_SOURCE_MAX_TOTAL_BYTES: z.coerce.number().int().positive().max(10_737_418_240).default(268_435_456),
  ARC_PROJECT_SOURCE_BATCH_SIZE: z.coerce.number().int().positive().max(2_000).default(500),
  ARC_PROJECT_SYMBOL_MAX_SYMBOLS_PER_FILE: z.coerce.number().int().positive().max(100_000).default(5_000),
  ARC_PROJECT_SYMBOL_MAX_TOTAL_SYMBOLS: z.coerce.number().int().positive().max(1_000_000).default(100_000),
  ARC_PROJECT_SYMBOL_MAX_NAME_BYTES: z.coerce.number().int().positive().max(4_096).default(512),
  ARC_PROJECT_SYMBOL_MAX_QUALIFIED_NAME_BYTES: z.coerce.number().int().positive().max(16_384).default(2_048),
  ARC_PROJECT_SYMBOL_YIELD_EVERY_FILES: z.coerce.number().int().positive().max(1_000).default(25),
  ARC_PROJECT_SYMBOL_BATCH_SIZE: z.coerce.number().int().positive().max(2_000).default(500),
  ARC_PROJECT_DEPENDENCY_MAX_EDGES_PER_FILE: z.coerce.number().int().positive().max(100_000).default(1_000),
  ARC_PROJECT_DEPENDENCY_MAX_TOTAL_EDGES: z.coerce.number().int().positive().max(1_000_000).default(100_000),
  ARC_PROJECT_DEPENDENCY_MAX_BINDINGS_PER_EDGE: z.coerce.number().int().positive().max(10_000).default(100),
  ARC_PROJECT_DEPENDENCY_MAX_TOTAL_BINDINGS: z.coerce.number().int().positive().max(2_500_000).default(250_000),
  ARC_PROJECT_DEPENDENCY_MAX_SPECIFIER_BYTES: z.coerce.number().int().positive().max(1_024).default(1_024),
  ARC_PROJECT_DEPENDENCY_MAX_BINDING_NAME_BYTES: z.coerce.number().int().positive().max(512).default(512),
  ARC_PROJECT_DEPENDENCY_MAX_CONFIG_BYTES: z.coerce.number().int().positive().max(16_777_216).default(1_048_576),
  ARC_PROJECT_DEPENDENCY_YIELD_EVERY_FILES: z.coerce.number().int().positive().max(1_000).default(25),
  ARC_PROJECT_DEPENDENCY_BATCH_SIZE: z.coerce.number().int().positive().max(2_000).default(500),
  ARC_PROJECT_DEPENDENCY_GRAPH_MAX_DEPTH: z.coerce.number().int().positive().max(5).default(5),
  ARC_PROJECT_DEPENDENCY_GRAPH_MAX_NODES: z.coerce.number().int().positive().max(500).default(500),
  ARC_PROJECT_DEPENDENCY_GRAPH_MAX_EDGES: z.coerce.number().int().positive().max(2_000).default(2_000),
  ARC_PROJECT_FRAMEWORK_MAX_ENTITIES_PER_FILE: z.coerce.number().int().positive().max(100_000).default(1_000),
  ARC_PROJECT_FRAMEWORK_MAX_RELATIONSHIPS_PER_FILE: z.coerce.number().int().positive().max(100_000).default(2_000),
  ARC_PROJECT_FRAMEWORK_MAX_TOTAL_ENTITIES: z.coerce.number().int().positive().max(1_000_000).default(100_000),
  ARC_PROJECT_FRAMEWORK_MAX_TOTAL_RELATIONSHIPS: z.coerce.number().int().positive().max(2_000_000).default(200_000),
  ARC_PROJECT_FRAMEWORK_MAX_NAME_BYTES: z.coerce.number().int().positive().max(4_096).default(512),
  ARC_PROJECT_FRAMEWORK_MAX_STATIC_VALUE_BYTES: z.coerce.number().int().positive().max(1_048_576).default(65_536),
  ARC_PROJECT_FRAMEWORK_MAX_PACKAGE_METADATA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(16_777_216)
    .default(1_048_576),
  ARC_PROJECT_FRAMEWORK_MAX_EVIDENCE_PER_FILE: z.coerce.number().int().positive().max(100_000).default(2_000),
  ARC_PROJECT_FRAMEWORK_MAX_STATIC_DEPTH: z.coerce.number().int().positive().max(64).default(12),
  ARC_PROJECT_FRAMEWORK_MAX_COLLECTION_ENTRIES: z.coerce.number().int().positive().max(10_000).default(100),
  ARC_PROJECT_FRAMEWORK_BATCH_SIZE: z.coerce.number().int().positive().max(2_000).default(500),
  ARC_PROJECT_FRAMEWORK_YIELD_EVERY_FILES: z.coerce.number().int().positive().max(1_000).default(25),
  ARC_PROJECT_FRAMEWORK_CATALOG_MAX_ENTITIES: z.coerce.number().int().positive().max(5_000).default(500),
  ARC_PROJECT_FRAMEWORK_CATALOG_MAX_RELATIONSHIPS: z.coerce.number().int().positive().max(10_000).default(1_000),
});

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly corsOrigin: string;
  readonly database: {
    readonly url: string;
    readonly connectTimeoutMs: number;
    readonly sync: boolean;
  };
  readonly ollama: {
    readonly baseUrl: string;
    readonly model?: string;
    readonly requestTimeoutMs: number;
    readonly readinessTimeoutMs: number;
  };
  readonly embedding: {
    readonly model?: string;
    readonly dimensions: number;
    readonly timeoutMs: number;
  };
  readonly projectScan: {
    readonly maxFiles: number;
    readonly maxTotalBytes: number;
    readonly maxDepth: number;
    readonly batchSize: number;
  };
  readonly projectSource: {
    readonly maxFileBytes: number;
    readonly maxTotalBytes: number;
    readonly batchSize: number;
  };
  readonly projectSymbol: {
    readonly maxSymbolsPerFile: number;
    readonly maxTotalSymbols: number;
    readonly maxNameBytes: number;
    readonly maxQualifiedNameBytes: number;
    readonly yieldEveryFiles: number;
    readonly batchSize: number;
  };
  readonly projectDependency: {
    readonly graphMaxDepth: number;
    readonly graphMaxNodes: number;
    readonly graphMaxEdges: number;
    readonly maxEdgesPerFile: number;
    readonly maxTotalEdges: number;
    readonly maxBindingsPerEdge: number;
    readonly maxTotalBindings: number;
    readonly maxSpecifierBytes: number;
    readonly maxBindingNameBytes: number;
    readonly maxConfigBytes: number;
    readonly yieldEveryFiles: number;
    readonly batchSize: number;
  };
  readonly projectFramework: {
    readonly maxEntitiesPerFile: number;
    readonly maxRelationshipsPerFile: number;
    readonly maxTotalEntities: number;
    readonly maxTotalRelationships: number;
    readonly maxNameBytes: number;
    readonly maxStaticValueBytes: number;
    readonly maxPackageMetadataBytes: number;
    readonly maxEvidencePerFile: number;
    readonly maxStaticDepth: number;
    readonly maxCollectionEntries: number;
    readonly batchSize: number;
    readonly yieldEveryFiles: number;
    readonly catalogMaxEntities: number;
    readonly catalogMaxRelationships: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.parse(env);

  const ollama = {
    baseUrl: parsed.ARC_OLLAMA_BASE_URL,
    requestTimeoutMs: parsed.ARC_OLLAMA_REQUEST_TIMEOUT_MS,
    readinessTimeoutMs: parsed.ARC_OLLAMA_READINESS_TIMEOUT_MS,
    ...(parsed.ARC_OLLAMA_MODEL === undefined ? {} : { model: parsed.ARC_OLLAMA_MODEL }),
  };

  const database = {
    url: parsed.ARC_DATABASE_URL,
    connectTimeoutMs: parsed.ARC_DATABASE_CONNECT_TIMEOUT_MS,
    sync: parsed.ARC_DATABASE_SYNC,
  };

  const embedding = {
    dimensions: parsed.ARC_OLLAMA_EMBEDDING_DIMENSIONS,
    timeoutMs: parsed.ARC_OLLAMA_EMBEDDING_TIMEOUT_MS,
    ...(parsed.ARC_OLLAMA_EMBEDDING_MODEL === undefined ? {} : { model: parsed.ARC_OLLAMA_EMBEDDING_MODEL }),
  };

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.ARC_SERVER_HOST,
    port: parsed.ARC_SERVER_PORT,
    corsOrigin: parsed.ARC_CORS_ORIGIN,
    database,
    embedding,
    ollama,
    projectScan: {
      maxFiles: parsed.ARC_PROJECT_SCAN_MAX_FILES,
      maxTotalBytes: parsed.ARC_PROJECT_SCAN_MAX_TOTAL_BYTES,
      maxDepth: parsed.ARC_PROJECT_SCAN_MAX_DEPTH,
      batchSize: parsed.ARC_PROJECT_SCAN_BATCH_SIZE,
    },
    projectSource: {
      batchSize: parsed.ARC_PROJECT_SOURCE_BATCH_SIZE,
      maxFileBytes: parsed.ARC_PROJECT_SOURCE_MAX_FILE_BYTES,
      maxTotalBytes: parsed.ARC_PROJECT_SOURCE_MAX_TOTAL_BYTES,
    },
    projectSymbol: {
      batchSize: parsed.ARC_PROJECT_SYMBOL_BATCH_SIZE,
      maxNameBytes: parsed.ARC_PROJECT_SYMBOL_MAX_NAME_BYTES,
      maxQualifiedNameBytes: parsed.ARC_PROJECT_SYMBOL_MAX_QUALIFIED_NAME_BYTES,
      maxSymbolsPerFile: parsed.ARC_PROJECT_SYMBOL_MAX_SYMBOLS_PER_FILE,
      maxTotalSymbols: parsed.ARC_PROJECT_SYMBOL_MAX_TOTAL_SYMBOLS,
      yieldEveryFiles: parsed.ARC_PROJECT_SYMBOL_YIELD_EVERY_FILES,
    },
    projectDependency: {
      batchSize: parsed.ARC_PROJECT_DEPENDENCY_BATCH_SIZE,
      graphMaxDepth: parsed.ARC_PROJECT_DEPENDENCY_GRAPH_MAX_DEPTH,
      graphMaxEdges: parsed.ARC_PROJECT_DEPENDENCY_GRAPH_MAX_EDGES,
      graphMaxNodes: parsed.ARC_PROJECT_DEPENDENCY_GRAPH_MAX_NODES,
      maxBindingNameBytes: parsed.ARC_PROJECT_DEPENDENCY_MAX_BINDING_NAME_BYTES,
      maxBindingsPerEdge: parsed.ARC_PROJECT_DEPENDENCY_MAX_BINDINGS_PER_EDGE,
      maxConfigBytes: parsed.ARC_PROJECT_DEPENDENCY_MAX_CONFIG_BYTES,
      maxEdgesPerFile: parsed.ARC_PROJECT_DEPENDENCY_MAX_EDGES_PER_FILE,
      maxSpecifierBytes: parsed.ARC_PROJECT_DEPENDENCY_MAX_SPECIFIER_BYTES,
      maxTotalBindings: parsed.ARC_PROJECT_DEPENDENCY_MAX_TOTAL_BINDINGS,
      maxTotalEdges: parsed.ARC_PROJECT_DEPENDENCY_MAX_TOTAL_EDGES,
      yieldEveryFiles: parsed.ARC_PROJECT_DEPENDENCY_YIELD_EVERY_FILES,
    },
    projectFramework: {
      batchSize: parsed.ARC_PROJECT_FRAMEWORK_BATCH_SIZE,
      catalogMaxEntities: parsed.ARC_PROJECT_FRAMEWORK_CATALOG_MAX_ENTITIES,
      catalogMaxRelationships: parsed.ARC_PROJECT_FRAMEWORK_CATALOG_MAX_RELATIONSHIPS,
      maxCollectionEntries: parsed.ARC_PROJECT_FRAMEWORK_MAX_COLLECTION_ENTRIES,
      maxEntitiesPerFile: parsed.ARC_PROJECT_FRAMEWORK_MAX_ENTITIES_PER_FILE,
      maxEvidencePerFile: parsed.ARC_PROJECT_FRAMEWORK_MAX_EVIDENCE_PER_FILE,
      maxNameBytes: parsed.ARC_PROJECT_FRAMEWORK_MAX_NAME_BYTES,
      maxPackageMetadataBytes: parsed.ARC_PROJECT_FRAMEWORK_MAX_PACKAGE_METADATA_BYTES,
      maxRelationshipsPerFile: parsed.ARC_PROJECT_FRAMEWORK_MAX_RELATIONSHIPS_PER_FILE,
      maxStaticDepth: parsed.ARC_PROJECT_FRAMEWORK_MAX_STATIC_DEPTH,
      maxStaticValueBytes: parsed.ARC_PROJECT_FRAMEWORK_MAX_STATIC_VALUE_BYTES,
      maxTotalEntities: parsed.ARC_PROJECT_FRAMEWORK_MAX_TOTAL_ENTITIES,
      maxTotalRelationships: parsed.ARC_PROJECT_FRAMEWORK_MAX_TOTAL_RELATIONSHIPS,
      yieldEveryFiles: parsed.ARC_PROJECT_FRAMEWORK_YIELD_EVERY_FILES,
    },
  };
}
