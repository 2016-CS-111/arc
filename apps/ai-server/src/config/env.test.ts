import { describe, expect, it } from "vitest";

import { loadConfig } from "./env.js";

describe("loadConfig", () => {
  it("uses local Ollama defaults without requiring a configured model", () => {
    const config = loadConfig({});

    expect(config.ollama).toEqual({
      baseUrl: "http://127.0.0.1:11434",
      requestTimeoutMs: 300_000,
      readinessTimeoutMs: 5_000,
    });
    expect(config.database).toEqual({
      connectTimeoutMs: 5_000,
      sync: false,
      url: "postgresql://postgres:postgres@127.0.0.1:5432/arc",
    });
  });

  it("normalizes the Ollama base URL and accepts a configured model", () => {
    const config = loadConfig({
      ARC_OLLAMA_BASE_URL: "http://localhost:11434///",
      ARC_OLLAMA_MODEL: "qwen2.5-coder:3b",
      ARC_OLLAMA_READINESS_TIMEOUT_MS: "2500",
      ARC_OLLAMA_REQUEST_TIMEOUT_MS: "120000",
      ARC_DATABASE_CONNECT_TIMEOUT_MS: "8000",
      ARC_DATABASE_SYNC: "true",
      ARC_DATABASE_URL: "postgres://arc:arc@localhost:5433/arc_test",
    });

    expect(config.ollama).toEqual({
      baseUrl: "http://localhost:11434",
      model: "qwen2.5-coder:3b",
      requestTimeoutMs: 120_000,
      readinessTimeoutMs: 2_500,
    });
    expect(config.database).toEqual({
      connectTimeoutMs: 8_000,
      sync: true,
      url: "postgres://arc:arc@localhost:5433/arc_test",
    });
  });

  it("rejects an empty model value", () => {
    expect(() => loadConfig({ ARC_OLLAMA_MODEL: "   " })).toThrow();
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() => loadConfig({ ARC_DATABASE_URL: "mysql://localhost/arc" })).toThrow();
  });

  it("rejects an invalid database sync value", () => {
    expect(() => loadConfig({ ARC_DATABASE_SYNC: "sometimes" })).toThrow();
  });
});
