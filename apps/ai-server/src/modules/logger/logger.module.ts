import { createConsoleLogger, type Logger } from "@arc/shared";
import { Module, type Provider } from "@nestjs/common";

import { ARC_LOGGER } from "./logger.constants.js";

const arcLoggerProvider: Provider<Logger> = {
  provide: ARC_LOGGER,
  useFactory: () => createConsoleLogger("ai-server"),
};

@Module({
  providers: [arcLoggerProvider],
  exports: [ARC_LOGGER],
})
export class LoggerModule {}
