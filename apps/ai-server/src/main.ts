import { createServer } from "node:http";

import { createConsoleLogger } from "@arc/shared";

import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { registerRealtimeGateway } from "./modules/realtime/registerRealtimeGateway.js";

const config = loadConfig();
const logger = createConsoleLogger("ai-server");
const app = createApp(config);
const server = createServer(app);

registerRealtimeGateway(server, logger);

server.on("error", (error) => {
  logger.error("HTTP server error", {
    message: error.message,
    name: error.name,
  });
  process.exit(1);
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info("Shutdown signal received", { signal });

  server.close((error) => {
    if (error !== undefined) {
      logger.error("Failed to close HTTP server", {
        message: error.message,
        name: error.name,
      });
      process.exit(1);
    }

    logger.info("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(config.port, config.host, () => {
  logger.info(`AI server listening on http://${config.host}:${String(config.port)}`);
});
