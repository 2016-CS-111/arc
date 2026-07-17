import { Global, Module, type Provider } from "@nestjs/common";

import { APP_CONFIG } from "./config.constants.js";
import { loadConfig, type AppConfig } from "./env.js";

const appConfigProvider: Provider<AppConfig> = {
  provide: APP_CONFIG,
  useFactory: (): AppConfig => loadConfig(),
};

@Global()
@Module({
  providers: [appConfigProvider],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
