import type { AppConfig } from "../../../../config/env.js";
import type { Logger } from "@arc/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatModelEvent } from "../../domain/chat-model.types.js";
import { OllamaChatModelAdapter } from "./ollama.adapter.js";

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};

const defaultModel = "qwen2.5-coder:7b";

function createConfig(model: string | null = defaultModel): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 7331,
    corsOrigin: "*",
    chatContext: {
      contextWindowTokens: 8_192,
      historyTokens: 2_560,
      maxSnippetBytes: 8_192,
      outputReserveTokens: 2_048,
      projectContextTokens: 3_072,
      resultLimit: 12,
    },
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
      requestTimeoutMs: 30_000,
      readinessTimeoutMs: 1_000,
      ...(model === null ? {} : { model }),
    },
  };
}

function createNdjsonResponse(records: readonly unknown[]): Response {
  return new Response(records.map((record) => JSON.stringify(record)).join("\n") + "\n", {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson",
    },
  });
}

async function collectEvents(stream: AsyncIterable<ChatModelEvent>): Promise<ChatModelEvent[]> {
  const events: ChatModelEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaChatModelAdapter", () => {
  it("reports a ready configured model", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ capabilities: ["completion"], details: {} }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaChatModelAdapter(createConfig(), logger);

    await expect(adapter.getStatus()).resolves.toMatchObject({
      status: "ready",
      model: "qwen2.5-coder:7b",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing configured model", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaChatModelAdapter(createConfig(), logger);

    await expect(adapter.getStatus()).resolves.toMatchObject({
      status: "model_missing",
      model: "qwen2.5-coder:7b",
    });
  });

  it("does not contact Ollama when a model is not configured", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaChatModelAdapter(createConfig(null), logger);

    await expect(adapter.getStatus()).resolves.toMatchObject({
      status: "not_configured",
      model: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an unreachable Ollama instance", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaChatModelAdapter(createConfig(), logger);

    await expect(adapter.getStatus()).resolves.toMatchObject({
      status: "unreachable",
      model: defaultModel,
    });
  });

  it("normalizes a streamed response into deltas and completion metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createNdjsonResponse([
        {
          model: "qwen2.5-coder:7b",
          created_at: "2026-07-18T00:00:00Z",
          message: { role: "assistant", content: "Hello" },
          done: false,
        },
        {
          model: "qwen2.5-coder:7b",
          created_at: "2026-07-18T00:00:00Z",
          message: { role: "assistant", content: " world" },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 8,
          eval_count: 2,
          total_duration: 2_500_000,
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaChatModelAdapter(createConfig(), logger);

    await expect(
      collectEvents(
        adapter.streamChat({
          messages: [{ role: "user", content: "Say hello" }],
        }),
      ),
    ).resolves.toEqual([
      { type: "delta", content: "Hello" },
      { type: "delta", content: " world" },
      {
        type: "completed",
        finishReason: "stop",
        usage: {
          promptTokens: 8,
          completionTokens: 2,
          totalDurationMs: 2.5,
        },
      },
    ]);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe("string");
    const requestBody = JSON.parse(body as string) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      options: {
        num_ctx: 8_192,
        num_predict: 2_048,
      },
    });
  });

  it("turns a mid-stream Ollama error into a typed request failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createNdjsonResponse([{ error: "model ran out of memory" }]));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaChatModelAdapter(createConfig(), logger);

    await expect(
      collectEvents(
        adapter.streamChat({
          messages: [{ role: "user", content: "Say hello" }],
        }),
      ),
    ).rejects.toMatchObject({
      code: "OLLAMA_REQUEST_FAILED",
      message: "model ran out of memory",
    });
  });

  it("reports caller cancellation without contacting Ollama", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaChatModelAdapter(createConfig(), logger);
    const controller = new AbortController();
    controller.abort();

    await expect(
      collectEvents(
        adapter.streamChat(
          {
            messages: [{ role: "user", content: "Say hello" }],
          },
          controller.signal,
        ),
      ),
    ).rejects.toMatchObject({
      code: "GENERATION_CANCELLED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
