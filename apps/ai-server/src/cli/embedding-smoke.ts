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

  const documents = await adapter.embed({
    purpose: "document",
    inputs: ["TypeScript semantic retrieval for local source code.", "A recipe for baking sourdough bread."],
  });
  const query = await adapter.embed({
    purpose: "query",
    inputs: ["Find TypeScript code using semantic search."],
  });
  const queryVector = query.vectors[0];
  const relevantDocument = documents.vectors[0];
  const unrelatedDocument = documents.vectors[1];
  if (queryVector === undefined || relevantDocument === undefined || unrelatedDocument === undefined) {
    throw new Error("The embedding model returned an incomplete smoke-test result.");
  }
  const relevantScore = cosine(queryVector, relevantDocument);
  const unrelatedScore = cosine(queryVector, unrelatedDocument);
  if (relevantScore <= unrelatedScore) {
    throw new Error("The embedding model did not rank the relevant document first.");
  }

  logger.info("Ollama embedding verification passed", {
    model: documents.model,
    dimensions: documents.dimensions,
    relevantScore,
    unrelatedScore,
    vectorCount: documents.vectors.length + query.vectors.length,
  });
}

function cosine(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("embedding-smoke");
  logger.error("Ollama embedding verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
