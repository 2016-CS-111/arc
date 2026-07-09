import cors from "cors";
import express, { type Express } from "express";

import type { AppConfig } from "./config/env.js";
import { createHealthRouter } from "./modules/health/health.routes.js";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: config.corsOrigin,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use(createHealthRouter());

  return app;
}
