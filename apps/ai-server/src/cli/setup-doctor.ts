import "reflect-metadata";

import { createConsoleLogger } from "@arc/shared";

import { loadConfig } from "../config/env.js";
import { createDatabase } from "../database/database.sequelize.js";
import { getPendingMigrations, loadMigrations } from "../database/migration-runner.js";
import { OllamaEmbeddingModelAdapter } from "../modules/embeddings/infrastructure/ollama/ollama-embedding.adapter.js";
import { OllamaChatModelAdapter } from "../modules/inference/infrastructure/ollama/ollama.adapter.js";
import { OllamaCodeCompletionAdapter } from "../modules/inference/infrastructure/ollama/ollama-code-completion.adapter.js";
import { SetupDoctorService } from "../setup/setup-doctor.service.js";

async function main(): Promise<void> {
  const logger = createConsoleLogger("setup-doctor");
  const config = loadConfig();
  const database = createDatabase(config);
  const chatModel = new OllamaChatModelAdapter(config, logger);
  const completionModel = new OllamaCodeCompletionAdapter(config, logger);
  const embeddingModel = new OllamaEmbeddingModelAdapter(config);

  try {
    const report = await new SetupDoctorService({
      checkDatabase: () => database.sequelize.authenticate(),
      getChatModelStatus: () => chatModel.getStatus(),
      getCompletionModelStatus: () => completionModel.getStatus(),
      ...(config.embedding.model === undefined ? {} : { getEmbeddingModelStatus: () => embeddingModel.getStatus() }),
      getPendingMigrations: async () => getPendingMigrations(database.sequelize, await loadMigrations()),
    }).run();

    logger.info("Arc setup doctor report", { checks: report.checks, ready: report.ready });
    if (!report.ready) process.exitCode = 1;
  } finally {
    await database.sequelize.close();
  }
}

main().catch((error: unknown) => {
  createConsoleLogger("setup-doctor").error("Arc setup doctor failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
