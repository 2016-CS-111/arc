import "reflect-metadata";

import { createConsoleLogger } from "@arc/shared";
import { QueryTypes } from "sequelize";

import { loadConfig } from "../config/env.js";
import { createDatabase } from "../database/database.sequelize.js";
import { loadMigrations, runMigrations } from "../database/migration-runner.js";

interface NearestVectorRow {
  readonly id: number;
  readonly dimensions: number;
  readonly distance: number | string;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("pgvector-smoke");
  const config = loadConfig();
  const database = createDatabase(config);

  try {
    await database.sequelize.authenticate();
    await runMigrations(database.sequelize, await loadMigrations());

    const row = await database.sequelize.transaction(async (transaction) => {
      await database.sequelize.query(
        "CREATE TEMP TABLE arc_vector_smoke (id INTEGER PRIMARY KEY, embedding vector(1024)) ON COMMIT DROP",
        { transaction },
      );
      await database.sequelize.query(
        `INSERT INTO arc_vector_smoke (id, embedding)
         VALUES
           (1, array_prepend(1::real, array_fill(0::real, ARRAY[1023]))::vector),
           (2, array_prepend(0::real, array_prepend(1::real, array_fill(0::real, ARRAY[1022])))::vector)`,
        { transaction },
      );

      const rows = await database.sequelize.query<NearestVectorRow>(
        `SELECT
           id,
           vector_dims(embedding)::integer AS dimensions,
           embedding <=> array_prepend(1::real, array_fill(0::real, ARRAY[1023]))::vector AS distance
         FROM arc_vector_smoke
         ORDER BY distance, id
         LIMIT 1`,
        { transaction, type: QueryTypes.SELECT },
      );

      return rows[0];
    });

    if (row?.id !== 1 || row.dimensions !== 1_024 || Number(row.distance) !== 0) {
      throw new Error("pgvector returned an unexpected cosine result.");
    }

    logger.info("pgvector verification passed", {
      dimensions: row.dimensions,
      nearestId: row.id,
    });
  } finally {
    await database.sequelize.close();
  }
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("pgvector-smoke");
  logger.error("pgvector verification failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
