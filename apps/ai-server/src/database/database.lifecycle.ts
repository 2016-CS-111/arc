import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";

import { DATABASE } from "./database.constants.js";
import type { ArcDatabase } from "./database.types.js";

@Injectable()
export class DatabaseLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseLifecycle.name);

  public constructor(@Inject(DATABASE) private readonly database: ArcDatabase) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.database.sequelize.authenticate();
      this.logger.log("PostgreSQL connection ready");
    } catch (error) {
      this.logger.warn(`PostgreSQL connection unavailable: ${getErrorMessage(error)}`);
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.database.sequelize.close();
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
