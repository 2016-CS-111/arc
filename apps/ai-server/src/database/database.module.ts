import { Global, Module, type Provider } from "@nestjs/common";
import type { Pool } from "pg";

import { ConfigModule } from "../config/config.module.js";
import { APP_CONFIG } from "../config/config.constants.js";
import type { AppConfig } from "../config/env.js";
import { DATABASE_POOL } from "./database.constants.js";
import { createDatabasePool } from "./database.pool.js";
import { DatabasePoolLifecycle } from "./database.pool-lifecycle.js";

const databasePoolProvider: Provider<Pool> = {
  provide: DATABASE_POOL,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): Pool => createDatabasePool(config),
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [databasePoolProvider, DatabasePoolLifecycle],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
