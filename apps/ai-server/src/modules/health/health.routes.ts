import { Router } from "express";

import { createHealthResponse } from "./createHealthResponse.js";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json(createHealthResponse());
  });

  return router;
}
