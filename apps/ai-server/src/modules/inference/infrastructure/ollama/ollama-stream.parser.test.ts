import { describe, expect, it } from "vitest";

import type { OllamaStreamRecord } from "./ollama.schemas.js";
import { parseOllamaNdjson } from "./ollama-stream.parser.js";

function createBody(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collectRecords(body: ReadableStream<Uint8Array>): Promise<OllamaStreamRecord[]> {
  const records: OllamaStreamRecord[] = [];

  for await (const record of parseOllamaNdjson(body)) {
    records.push(record);
  }

  return records;
}

describe("parseOllamaNdjson", () => {
  it("handles fragmented UTF-8, blank records, and a final record without a newline", async () => {
    const rocket = String.fromCodePoint(0x1f680);
    const text = [
      JSON.stringify({
        model: "qwen2.5-coder:3b",
        created_at: "2026-07-18T00:00:00Z",
        message: { role: "assistant", content: `Hello ${rocket}` },
        done: false,
      }),
      "",
      JSON.stringify({
        model: "qwen2.5-coder:3b",
        created_at: "2026-07-18T00:00:00Z",
        message: { role: "assistant", content: "" },
        done: true,
        done_reason: "stop",
      }),
    ].join("\n");
    const bytes = new TextEncoder().encode(text);
    const rocketFirstByte = new TextEncoder().encode(rocket)[0];
    const rocketStart = bytes.indexOf(rocketFirstByte ?? 0);
    const body = createBody([
      bytes.slice(0, rocketStart + 1),
      bytes.slice(rocketStart + 1, rocketStart + 3),
      bytes.slice(rocketStart + 3),
    ]);

    const records = await collectRecords(body);

    expect(records).toHaveLength(2);

    const firstRecord = records[0];
    const secondRecord = records[1];

    expect(firstRecord?.kind).toBe("chat");
    expect(secondRecord?.kind).toBe("chat");

    if (firstRecord?.kind !== "chat" || secondRecord?.kind !== "chat") {
      throw new Error("Expected Ollama chat records.");
    }

    expect(firstRecord.response.done).toBe(false);
    expect(firstRecord.response.message.content).toBe(`Hello ${rocket}`);
    expect(secondRecord.response.done).toBe(true);
    expect(secondRecord.response.done_reason).toBe("stop");
  });

  it("rejects malformed stream records", async () => {
    const body = createBody([new TextEncoder().encode("not-json\n")]);

    await expect(collectRecords(body)).rejects.toMatchObject({
      code: "OLLAMA_PROTOCOL_ERROR",
    });
  });

  it("returns mid-stream Ollama errors as typed records", async () => {
    const body = createBody([
      new TextEncoder().encode(JSON.stringify({ error: "model overloaded" }) + "\n"),
    ]);

    await expect(collectRecords(body)).resolves.toEqual([
      {
        kind: "error",
        message: "model overloaded",
      },
    ]);
  });
});
