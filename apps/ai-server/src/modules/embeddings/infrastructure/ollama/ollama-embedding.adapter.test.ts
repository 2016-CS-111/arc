import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../../config/env.js";
import type { EmbeddingModelError } from "../../domain/embedding-model.errors.js";
import { OllamaEmbeddingModelAdapter } from "./ollama-embedding.adapter.js";

function createAdapter(model = "bge-m3"): OllamaEmbeddingModelAdapter {
  return new OllamaEmbeddingModelAdapter(
    loadConfig({
      NODE_ENV: "test",
      ARC_OLLAMA_EMBEDDING_MODEL: model,
      ARC_OLLAMA_EMBEDDING_DIMENSIONS: "3",
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaEmbeddingModelAdapter", () => {
  it("does not contact Ollama without an embedding model", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaEmbeddingModelAdapter(loadConfig({ NODE_ENV: "test" }));

    await expect(adapter.getStatus()).resolves.toMatchObject({
      status: "not_configured",
      model: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a ready embedding model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ details: {} }), { status: 200 })),
    );

    await expect(createAdapter().getStatus()).resolves.toMatchObject({
      status: "ready",
      model: "bge-m3",
      dimensions: 3,
    });
  });

  it("creates a batch without truncating inputs", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "bge-m3",
          embeddings: [
            [1, 0, 0],
            [0, 1, 0],
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createAdapter().embed({
      purpose: "document",
      inputs: ["first", "second"],
    });
    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body;
    if (typeof body !== "string") {
      throw new Error("Expected Ollama request body.");
    }

    expect(result).toMatchObject({
      model: "bge-m3",
      dimensions: 3,
      inputFormat: "plain-v1",
    });
    expect(JSON.parse(body)).toMatchObject({
      model: "bge-m3",
      input: ["first", "second"],
      truncate: false,
    });
  });

  it("rejects vectors with unexpected dimensions", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ model: "bge-m3", embeddings: [[1, 0]] }), { status: 200 })),
    );

    await expect(
      createAdapter().embed({
        purpose: "query",
        inputs: ["query"],
      }),
    ).rejects.toMatchObject<Partial<EmbeddingModelError>>({
      code: "EMBEDDING_PROTOCOL_ERROR",
    });
  });
});
