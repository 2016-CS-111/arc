import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";

import { DATABASE_POOL } from "./database.constants.js";

@Injectable()
export class DatabasePoolLifecycle implements OnApplicationShutdown {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
