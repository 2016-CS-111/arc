import { Sequelize } from "sequelize";

import type { AppConfig } from "../config/env.js";
import { createDatabaseModels } from "./models/index.js";
import type { ArcDatabase } from "./database.types.js";

export function createDatabase(config: AppConfig): ArcDatabase {
  const sequelize = new Sequelize(config.database.url, {
    dialect: "postgres",
    dialectOptions: {
      connectionTimeoutMillis: config.database.connectTimeoutMs,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30_000,
      idle: 10_000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
    logging: false,
  });

  return {
    sequelize,
    models: createDatabaseModels(sequelize),
  };
}
