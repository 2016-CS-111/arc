import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";

import { APP_CONFIG } from "../config/config.constants.js";
import type { AppConfig } from "../config/env.js";
import { DATABASE } from "./database.constants.js";
import type { ArcDatabase } from "./database.types.js";

@Injectable()
export class DatabaseLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseLifecycle.name);

  public constructor(
    @Inject(DATABASE) private readonly database: ArcDatabase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.database.sequelize.authenticate();
      this.logger.log("PostgreSQL connection ready");
    } catch (error) {
      this.logger.warn(`PostgreSQL connection unavailable: ${getErrorMessage(error)}`);
      return;
    }

    if (!this.config.database.sync) {
      return;
    }

    try {
      await this.database.sequelize.sync();
      this.logger.log("PostgreSQL Sequelize models synchronized");
    } catch (error) {
      this.logger.warn(`PostgreSQL Sequelize sync failed: ${getErrorMessage(error)}`);
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.database.sequelize.close();
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
