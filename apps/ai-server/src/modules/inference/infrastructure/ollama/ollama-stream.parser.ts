import { ChatModelError } from "../../domain/chat-model.errors.js";
import { parseOllamaStreamRecord, type OllamaStreamRecord } from "./ollama.schemas.js";

export async function* parseOllamaNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<OllamaStreamRecord> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      buffered += decoder.decode(next.value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";

      for (const line of lines) {
        const record = parseLine(line);
        if (record !== undefined) {
          yield record;
        }
      }
    }

    buffered += decoder.decode();
    if (buffered.trim().length > 0) {
      const record = parseLine(buffered);
      if (record !== undefined) {
        yield record;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseLine(line: string): OllamaStreamRecord | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  try {
    return parseOllamaStreamRecord(JSON.parse(trimmed) as unknown);
  } catch (error) {
    if (error instanceof ChatModelError) {
      throw error;
    }

    throw new ChatModelError("OLLAMA_PROTOCOL_ERROR", "Ollama returned malformed NDJSON.", {
      cause: error,
    });
  }
}
