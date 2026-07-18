import { Global, Module, type Provider } from "@nestjs/common";

import { ConfigModule } from "../config/config.module.js";
import { APP_CONFIG } from "../config/config.constants.js";
import type { AppConfig } from "../config/env.js";
import { DATABASE } from "./database.constants.js";
import { DatabaseLifecycle } from "./database.lifecycle.js";
import { createDatabase } from "./database.sequelize.js";
import type { ArcDatabase } from "./database.types.js";

const databaseProvider: Provider<ArcDatabase> = {
  provide: DATABASE,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): ArcDatabase => createDatabase(config),
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [databaseProvider, DatabaseLifecycle],
  exports: [DATABASE],
})
export class DatabaseModule {}
