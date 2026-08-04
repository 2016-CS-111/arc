import type { Logger } from "@arc/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../../config/env.js";
import { OllamaCodeCompletionAdapter } from "./ollama-code-completion.adapter.js";

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaCodeCompletionAdapter", () => {
  it("detects completion capability and sends a prefix/suffix request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ capabilities: ["completion"], details: {} }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ done: true, model: "qwen2.5-coder:7b", response: "value", total_duration: 2_500_000 }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OllamaCodeCompletionAdapter(loadConfig(), logger);

    await expect(adapter.getStatus()).resolves.toMatchObject({ status: "ready", supportsFillInMiddle: true });
    const completion = await adapter.complete({
      language: "typescript",
      maxTokens: 32,
      prefix: "const value = ",
      suffix: ";",
    });
    expect(completion.completion).toBe("value");
    expect(completion.latencyMs).toEqual(expect.any(Number));
    expect(completion.model).toBe("qwen2.5-coder:7b");
    const body = fetchMock.mock.calls[1]?.[1]?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toMatchObject({
      options: { num_predict: 32, temperature: 0.15 },
      prompt: "const value = ",
      stream: false,
      suffix: ";",
    });
  });

  it("reports models without completion support as unsupported", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ capabilities: ["chat"], details: {} }), { status: 200 })),
    );
    const adapter = new OllamaCodeCompletionAdapter(loadConfig(), logger);

    await expect(adapter.getStatus()).resolves.toMatchObject({ status: "unsupported", supportsFillInMiddle: false });
  });
});
