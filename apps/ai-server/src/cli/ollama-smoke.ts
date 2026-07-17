import "reflect-metadata";

import { createConsoleLogger } from "@arc/shared";

import { loadConfig } from "../config/env.js";
import { OllamaChatModelAdapter } from "../modules/inference/infrastructure/ollama/ollama.adapter.js";

const defaultPrompt = "Reply with one short sentence confirming that Arc can stream from Ollama.";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createConsoleLogger("ollama-smoke");
  const adapter = new OllamaChatModelAdapter(config, logger);
  const status = await adapter.getStatus();

  if (status.status !== "ready") {
    logger.error("Ollama is not ready", {
      model: status.model,
      status: status.status,
      ...(status.message === undefined ? {} : { message: status.message }),
    });
    process.exitCode = 1;
    return;
  }

  const prompt = process.argv.slice(2).join(" ").trim() || defaultPrompt;
  let completed = false;

  for await (const event of adapter.streamChat({
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  })) {
    if (event.type === "delta") {
      process.stdout.write(event.content);
      continue;
    }

    completed = true;
    process.stdout.write("\n");
    logger.info("Ollama stream completed", {
      ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
      ...(event.usage === undefined ? {} : { usage: event.usage }),
    });
  }

  if (!completed) {
    logger.error("Ollama stream ended without a completion event");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("ollama-smoke");
  logger.error("Ollama smoke test failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
