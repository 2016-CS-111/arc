import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { SOURCE_TEXT_READER } from "../projects.constants.js";
import {
  DEFAULT_PROJECT_SOURCE_CHUNK_LIMITS,
  PROJECT_SOURCE_CHUNKER_IDENTITY,
  PROJECT_SOURCE_INPUT_FORMAT,
  type ProjectSourceChunk,
  type ProjectSourceChunkInput,
  type ProjectSourceChunkLimits,
  type ProjectSourceChunkOwner,
  type ProjectSourceChunkResult,
} from "../domain/project-source-chunk.types.js";
import type { ProjectSymbolCatalogRecord } from "../domain/project-symbol-index.types.js";
import type { SourceCodeRange } from "../domain/source-code.types.js";
import { ProjectSourceChunkError } from "../domain/project.errors.js";
import type { SourceTextReader } from "./source-text.reader.js";

interface ChunkState {
  readonly bytes: Buffer;
  readonly chunks: ProjectSourceChunk[];
  readonly input: ProjectSourceChunkInput;
  readonly limits: ProjectSourceChunkLimits;
  readonly lineStarts: readonly number[];
  readonly occurrences: Map<string, number>;
  truncated: boolean;
}

@Injectable()
export class ProjectSourceChunker {
  public constructor(
    @Inject(SOURCE_TEXT_READER)
    private readonly sourceTextReader: SourceTextReader,
  ) {}

  public async chunk(input: ProjectSourceChunkInput): Promise<ProjectSourceChunkResult> {
    const source = await this.sourceTextReader.inspect({
      rootPath: input.rootPath,
      file: {
        path: input.sourceFile.relativePath,
        sizeBytes: input.sourceFile.sizeBytes,
        modifiedAt: input.sourceFile.modifiedAt,
      },
      maxFileBytes: input.sourceFile.sizeBytes,
    });

    if (source.status !== "ready") {
      throw new ProjectSourceChunkError("source_unavailable", "Arc could not read the indexed source file.");
    }
    if (source.contentHash !== input.sourceFile.contentHash) {
      throw new ProjectSourceChunkError(
        "source_hash_mismatch",
        "The source file changed after the current source index.",
      );
    }

    const bytes = Buffer.from(source.content, "utf8");
    const state: ChunkState = {
      bytes,
      chunks: [],
      input,
      limits: input.limits ?? DEFAULT_PROJECT_SOURCE_CHUNK_LIMITS,
      lineStarts: this.getLineStarts(bytes),
      occurrences: new Map(),
      truncated: false,
    };

    let cursor = 0;
    for (const symbol of this.selectSymbols(input, bytes.length)) {
      if (!this.appendRange(state, cursor, symbol.range.startByte, null)) {
        return this.result(state);
      }
      if (!this.appendRange(state, symbol.range.startByte, symbol.range.endByte, this.toOwner(symbol))) {
        return this.result(state);
      }
      cursor = symbol.range.endByte;
    }

    this.appendRange(state, cursor, bytes.length, null);
    return this.result(state);
  }

  private appendRange(
    state: ChunkState,
    rangeStart: number,
    rangeEnd: number,
    owner: ProjectSourceChunkOwner | null,
  ): boolean {
    let startByte = rangeStart;

    while (startByte < rangeEnd) {
      const endByte = this.findChunkEnd(state.bytes, startByte, rangeEnd, state.limits.maxSourceBytes);
      const content = state.bytes.subarray(startByte, endByte).toString("utf8");

      if (content.trim().length > 0) {
        if (state.chunks.length >= state.limits.maxChunksPerFile) {
          state.truncated = true;
          return false;
        }
        state.chunks.push(this.createChunk(state, content, startByte, endByte, owner));
      }

      startByte = endByte;
    }

    return true;
  }

  private createChunk(
    state: ChunkState,
    content: string,
    startByte: number,
    endByte: number,
    owner: ProjectSourceChunkOwner | null,
  ): ProjectSourceChunk {
    const contentHash = this.hash(content);
    const occurrenceKey = JSON.stringify([contentHash, owner?.identityKey ?? null]);
    const occurrence = state.occurrences.get(occurrenceKey) ?? 0;
    state.occurrences.set(occurrenceKey, occurrence + 1);

    const embeddingInput = this.createEmbeddingInput(state.input, content, owner);

    return {
      identityKey: this.hash(
        JSON.stringify([
          PROJECT_SOURCE_CHUNKER_IDENTITY,
          state.input.sourceFile.relativePath,
          contentHash,
          owner?.identityKey ?? null,
          occurrence,
        ]),
      ),
      inputFormat: PROJECT_SOURCE_INPUT_FORMAT,
      inputHash: this.hash(embeddingInput),
      contentHash,
      embeddingInput,
      language: state.input.sourceFile.language,
      ordinal: state.chunks.length,
      owner,
      range: this.toRange(state.lineStarts, startByte, endByte),
      relativePath: state.input.sourceFile.relativePath,
      sourceBytes: endByte - startByte,
      sourceFileId: state.input.sourceFile.id,
      sourceHash: state.input.sourceFile.contentHash,
    };
  }

  private createEmbeddingInput(
    input: ProjectSourceChunkInput,
    content: string,
    owner: ProjectSourceChunkOwner | null,
  ): string {
    const metadata = [
      `file: ${input.sourceFile.relativePath}`,
      `language: ${input.sourceFile.language}`,
      ...(owner === null ? [] : [`symbol: ${owner.qualifiedName} (${owner.kind})`]),
    ];

    return `${metadata.join("\n")}\n---\n${content}`;
  }

  private findChunkEnd(bytes: Buffer, startByte: number, rangeEnd: number, maxBytes: number): number {
    const limit = Math.min(startByte + maxBytes, rangeEnd);
    if (limit === rangeEnd) {
      return rangeEnd;
    }

    const newline = bytes.lastIndexOf(0x0a, limit - 1);
    if (newline >= startByte) {
      return newline + 1;
    }

    let endByte = limit;
    while (endByte > startByte && isUtf8ContinuationByte(bytes[endByte])) {
      endByte -= 1;
    }

    return endByte > startByte ? endByte : limit;
  }

  private getLineStarts(bytes: Buffer): number[] {
    const starts = [0];
    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index] === 0x0a) {
        starts.push(index + 1);
      }
    }
    return starts;
  }

  private toRange(lineStarts: readonly number[], startByte: number, endByte: number): SourceCodeRange {
    const start = this.locate(lineStarts, startByte);
    const end = this.locate(lineStarts, endByte);

    return {
      startByte,
      startLine: start.line,
      startColumnByte: startByte - start.lineStart,
      endByte,
      endLine: end.line,
      endColumnByte: endByte - end.lineStart,
    };
  }

  private locate(lineStarts: readonly number[], offset: number): { readonly line: number; readonly lineStart: number } {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return { line: low, lineStart: lineStarts[low] ?? 0 };
  }

  private selectSymbols(input: ProjectSourceChunkInput, sourceBytes: number): ProjectSymbolCatalogRecord[] {
    const candidates = input.symbols
      .filter(
        (symbol) =>
          symbol.sourceFileId === input.sourceFile.id &&
          symbol.range.startByte >= 0 &&
          symbol.range.endByte > symbol.range.startByte &&
          symbol.range.endByte <= sourceBytes,
      )
      .sort(
        (left, right) =>
          left.range.startByte - right.range.startByte ||
          right.range.endByte - left.range.endByte ||
          left.identityKey.localeCompare(right.identityKey),
      );
    const selected: ProjectSymbolCatalogRecord[] = [];
    let coveredUntil = 0;

    for (const symbol of candidates) {
      if (symbol.range.startByte < coveredUntil) {
        continue;
      }
      selected.push(symbol);
      coveredUntil = symbol.range.endByte;
    }

    return selected;
  }

  private toOwner(symbol: ProjectSymbolCatalogRecord): ProjectSourceChunkOwner {
    return {
      id: symbol.id,
      identityKey: symbol.identityKey,
      kind: symbol.kind,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
    };
  }

  private result(state: ChunkState): ProjectSourceChunkResult {
    return {
      chunkerIdentity: PROJECT_SOURCE_CHUNKER_IDENTITY,
      chunks: state.chunks,
      truncated: state.truncated,
    };
  }

  private hash(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}

function isUtf8ContinuationByte(value: number | undefined): boolean {
  return value !== undefined && (value & 0xc0) === 0x80;
}
