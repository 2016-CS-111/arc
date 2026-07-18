import "reflect-metadata";

import { createConsoleLogger } from "@arc/shared";
import { QueryTypes, Sequelize } from "sequelize";

import { loadConfig } from "../config/env.js";

interface DatabaseRow {
  readonly exists: number;
}

async function main(): Promise<void> {
  const logger = createConsoleLogger("db-create");
  const config = loadConfig();
  const targetUrl = new URL(config.database.url);
  const databaseName = getDatabaseName(targetUrl);
  const administrator = new Sequelize(createAdministratorUrl(targetUrl).toString(), {
    dialect: "postgres",
    dialectOptions: {
      connectionTimeoutMillis: config.database.connectTimeoutMs,
    },
    logging: false,
  });

  try {
    const databases = await administrator.query<DatabaseRow>(
      "SELECT 1 AS exists FROM pg_database WHERE datname = $1 LIMIT 1",
      {
        bind: [databaseName],
        type: QueryTypes.SELECT,
      },
    );

    if (databases.length === 0) {
      await administrator.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      logger.info("Created local Arc PostgreSQL database", { database: databaseName });
      return;
    }

    logger.info("Local Arc PostgreSQL database already exists", { database: databaseName });
  } finally {
    await administrator.close();
  }
}

function createAdministratorUrl(targetUrl: URL): URL {
  const administratorUrl = new URL(targetUrl.toString());
  administratorUrl.pathname = "/postgres";
  return administratorUrl;
}

function getDatabaseName(url: URL): string {
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (databaseName.length === 0) {
    throw new Error("ARC_DATABASE_URL must include a PostgreSQL database name.");
  }

  return databaseName;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

main().catch((error: unknown) => {
  const logger = createConsoleLogger("db-create");
  logger.error("Could not create the local Arc PostgreSQL database", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
