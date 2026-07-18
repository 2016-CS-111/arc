import { describe, expect, it, vi } from "vitest";

import { BackendStatusClient } from "./BackendStatusClient.js";

const checkedAt = "2026-07-18T12:00:00.000Z";

function response(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: ok ? status : status,
  });
}

describe("BackendStatusClient", () => {
  it("returns validated backend and Ollama status", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          service: "arc-ai-server",
          status: "ok",
          timestamp: checkedAt,
          uptimeSeconds: 4,
        }),
      )
      .mockResolvedValueOnce(
        response({
          latencyMs: 24,
          model: "qwen2.5-coder:7b",
          provider: "ollama",
          status: "ready",
        }),
      );
    const client = new BackendStatusClient("http://127.0.0.1:7331", fetchImplementation);

    await expect(client.getStatus()).resolves.toEqual({
      backend: {
        service: "arc-ai-server",
        status: "ok",
        timestamp: checkedAt,
        uptimeSeconds: 4,
      },
      ollama: {
        latencyMs: 24,
        model: "qwen2.5-coder:7b",
        provider: "ollama",
        status: "ready",
      },
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:7331/health",
      expect.any(Object),
    );
  });

  it("keeps backend status when its provider endpoint is unavailable", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          service: "arc-ai-server",
          status: "ok",
          timestamp: checkedAt,
          uptimeSeconds: 4,
        }),
      )
      .mockResolvedValueOnce(response({}, false, 503));
    const client = new BackendStatusClient("http://127.0.0.1:7331", fetchImplementation);

    await expect(client.getStatus()).resolves.toEqual({
      backend: {
        service: "arc-ai-server",
        status: "ok",
        timestamp: checkedAt,
        uptimeSeconds: 4,
      },
      error: "Ollama status check returned HTTP 503.",
      ollama: null,
    });
  });

  it("returns an unavailable status when the backend cannot be reached", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const client = new BackendStatusClient("http://127.0.0.1:7331", fetchImplementation);

    await expect(client.getStatus()).resolves.toEqual({
      backend: null,
      error: "Arc backend is unavailable.",
      ollama: null,
    });
  });
});
