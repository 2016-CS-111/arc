import { Pool } from "pg";

import type { AppConfig } from "../config/env.js";

export function createDatabasePool(config: AppConfig): Pool {
  return new Pool({
    connectionTimeoutMillis: config.database.connectTimeoutMs,
    max: 5,
    connectionString: config.database.url,
  });
}
