import "reflect-metadata";

import { createConsoleLogger } from "@arc/shared";

import { loadConfig } from "../config/env.js";
import { OllamaEmbeddingModelAdapter } from "../modules/embeddings/infrastructure/ollama/ollama-embedding.adapter.js";

async function main(): Promise<void> {
  const logger = createConsoleLogger("embedding-smoke");
  const adapter = new OllamaEmbeddingModelAdapter(loadConfig());
  const status = await adapter.getStatus();

  if (status.status !== "ready") {
    throw new Error(status.message ?? `Embedding provider status is ${status.status}.`);
  }

  const result = await adapter.embed({
    purpose: "document",
    inputs: ["Arc local embedding smoke.", "TypeScript semantic retrieval."],
  });

  logger.info("Ollama embedding verification passed", {
    model: result.model,
    dimensions: result.dimensions,
    vectorCount: result.vectors.length,
  });
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("embedding-smoke");
  logger.error("Ollama embedding verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
