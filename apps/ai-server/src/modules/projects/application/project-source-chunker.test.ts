import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ReadyProjectSourceFile } from "../domain/project-source-index.types.js";
import type { ProjectSymbolCatalogRecord } from "../domain/project-symbol-index.types.js";
import type { ProjectSourceChunkError } from "../domain/project.errors.js";
import type { SourceTextReader } from "./source-text.reader.js";
import { ProjectSourceChunker } from "./project-source-chunker.js";

const modifiedAt = "2026-07-29T10:00:00.000Z";
const sourceFileId = "source-file-1";

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createSourceFile(content: string): ReadyProjectSourceFile {
  return {
    id: sourceFileId,
    contentHash: hash(content),
    language: "typescript",
    modifiedAt,
    relativePath: "src/example.ts",
    sizeBytes: Buffer.byteLength(content, "utf8"),
  };
}

function createSymbol(
  content: string,
  startText: string,
  options: {
    readonly endByte?: number;
    readonly id?: string;
    readonly identityKey?: string;
    readonly name?: string;
  } = {},
): ProjectSymbolCatalogRecord {
  const startByte = Buffer.byteLength(content.slice(0, content.indexOf(startText)), "utf8");
  const endByte = options.endByte ?? Buffer.byteLength(content, "utf8");
  const name = options.name ?? "greet";

  return {
    id: options.id ?? `symbol-${name}`,
    exported: true,
    identityKey: options.identityKey ?? hash(`symbol:${name}`),
    kind: "function",
    name,
    parentIdentityKey: null,
    qualifiedName: name,
    range: {
      startByte,
      startColumnByte: 0,
      startLine: 0,
      endByte,
      endColumnByte: 0,
      endLine: 0,
    },
    relativePath: "src/example.ts",
    sourceFileId,
  };
}

function createChunker(content: string, contentHash = hash(content)): ProjectSourceChunker {
  const sourceTextReader = {
    inspect: vi.fn(() =>
      Promise.resolve({
        content,
        contentHash,
        inspectedBytes: Buffer.byteLength(content, "utf8"),
        modifiedAt,
        sizeBytes: Buffer.byteLength(content, "utf8"),
        status: "ready" as const,
      }),
    ),
  } satisfies SourceTextReader;

  return new ProjectSourceChunker(sourceTextReader);
}

function readChunkSource(content: string, startByte: number, endByte: number): string {
  return Buffer.from(content, "utf8").subarray(startByte, endByte).toString("utf8");
}

describe("ProjectSourceChunker", () => {
  it("uses a complete outer symbol and fills uncovered source", async () => {
    const content = 'import "reflect-metadata";\n\nexport function greet() {\n  return "hello";\n}\n';
    const outer = createSymbol(content, "export function");
    const nested = createSymbol(content, 'return "hello"', {
      id: "nested-symbol",
      identityKey: hash("nested"),
      name: "nested",
    });

    const result = await createChunker(content).chunk({
      rootPath: "/workspace",
      sourceFile: createSourceFile(content),
      symbols: [nested, outer],
    });

    expect(result.truncated).toBe(false);
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]?.owner).toBeNull();
    expect(result.chunks[1]?.owner).toMatchObject({ id: outer.id, name: "greet" });
    expect(result.chunks.map((chunk) => readChunkSource(content, chunk.range.startByte, chunk.range.endByte))).toEqual([
      'import "reflect-metadata";\n\n',
      'export function greet() {\n  return "hello";\n}\n',
    ]);
  });

  it("splits an oversized symbol at UTF-8-safe line boundaries", async () => {
    const line = 'const café = "🙂";\n';
    const content = line.repeat(3);
    const symbol = createSymbol(content, "const");

    const result = await createChunker(content).chunk({
      rootPath: "/workspace",
      sourceFile: createSourceFile(content),
      symbols: [symbol],
      limits: { maxChunksPerFile: 10, maxSourceBytes: Buffer.byteLength(line, "utf8") },
    });

    expect(result.chunks).toHaveLength(3);
    expect(result.chunks.every((chunk) => chunk.sourceBytes <= Buffer.byteLength(line, "utf8"))).toBe(true);
    expect(result.chunks.every((chunk) => chunk.owner?.id === symbol.id)).toBe(true);
    expect(
      result.chunks.map((chunk) => readChunkSource(content, chunk.range.startByte, chunk.range.endByte)).join(""),
    ).toBe(content);
    expect(result.chunks.map((chunk) => chunk.range.startLine)).toEqual([0, 1, 2]);
  });

  it("uses bounded fallback windows and reports truncation", async () => {
    const content = ["first line\n", "second line\n", "third line\n"].join("");
    const lineBytes = Buffer.byteLength("second line\n", "utf8");

    const result = await createChunker(content).chunk({
      rootPath: "/workspace",
      sourceFile: createSourceFile(content),
      symbols: [],
      limits: { maxChunksPerFile: 2, maxSourceBytes: lineBytes },
    });

    expect(result.truncated).toBe(true);
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks.every((chunk) => chunk.owner === null && chunk.sourceBytes <= lineBytes)).toBe(true);
  });

  it("keeps a symbol chunk identity stable when its byte offset moves", async () => {
    const symbolContent = "export function greet() {\n  return 1;\n}\n";
    const shiftedContent = `// shifted\n${symbolContent}`;
    const identityKey = hash("stable-greet");
    const firstSymbol = createSymbol(symbolContent, "export function", { identityKey });
    const shiftedSymbol = createSymbol(shiftedContent, "export function", { identityKey });

    const first = await createChunker(symbolContent).chunk({
      rootPath: "/workspace",
      sourceFile: createSourceFile(symbolContent),
      symbols: [firstSymbol],
    });
    const shifted = await createChunker(shiftedContent).chunk({
      rootPath: "/workspace",
      sourceFile: createSourceFile(shiftedContent),
      symbols: [shiftedSymbol],
    });

    const firstChunk = first.chunks.find((chunk) => chunk.owner !== null);
    const shiftedChunk = shifted.chunks.find((chunk) => chunk.owner !== null);
    expect(shiftedChunk?.identityKey).toBe(firstChunk?.identityKey);
    expect(shiftedChunk?.inputHash).toBe(firstChunk?.inputHash);
  });

  it("rejects source content that drifted from the source catalog", async () => {
    const content = "export const value = 1;\n";
    const chunker = createChunker(content, hash("changed content"));

    await expect(
      chunker.chunk({
        rootPath: "/workspace",
        sourceFile: createSourceFile(content),
        symbols: [],
      }),
    ).rejects.toMatchObject<Partial<ProjectSourceChunkError>>({
      code: "source_hash_mismatch",
    });
  });
});
