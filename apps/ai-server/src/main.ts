import "reflect-metadata";

import type { LogContext } from "@arc/shared";
import { createConsoleLogger } from "@arc/shared";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();
const logger = createConsoleLogger("ai-server");

function toLogContext(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    error: String(error),
  };
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  app.enableCors({
    origin: config.corsOrigin,
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info("Shutdown signal received", { signal });

    try {
      await app.close();
      logger.info("Nest application closed");
      process.exit(0);
    } catch (error) {
      logger.error("Failed to close Nest application", toLogContext(error));
      process.exit(1);
    }
  };

  process.on("SIGINT", (signal) => {
    void shutdown(signal);
  });
  process.on("SIGTERM", (signal) => {
    void shutdown(signal);
  });

  try {
    await app.listen(config.port, config.host);
    logger.info(`AI server listening on http://${config.host}:${String(config.port)}`);
  } catch (error) {
    logger.error("Failed to start AI server", toLogContext(error));
    process.exit(1);
  }
}

bootstrap().catch((error: unknown) => {
  logger.error("Unhandled bootstrap failure", toLogContext(error));
  process.exit(1);
});
