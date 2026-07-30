import { createHash } from "node:crypto";

import type { ProjectSemanticSearchResult } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PROJECT_REPOSITORY, PROJECT_SOURCE_INDEX_REPOSITORY, SOURCE_TEXT_READER } from "../projects.constants.js";
import type { ReadyProjectSourceFile } from "../domain/project-source-index.types.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { SourceTextReader } from "./source-text.reader.js";

export type ProjectSourceRangeOmissionReason =
  | "project_not_found"
  | "source_catalog_required"
  | "source_catalog_stale"
  | "source_file_missing"
  | "source_identity_mismatch"
  | "source_unavailable"
  | "source_hash_mismatch"
  | "invalid_range"
  | "overlapping_range"
  | "snippet_too_large"
  | "total_bytes_exceeded"
  | "content_hash_mismatch";

export interface ProjectSourceSnippet {
  readonly chunkId: string;
  readonly relativePath: string;
  readonly language: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly symbolName: string | null;
  readonly content: string;
  readonly sizeBytes: number;
}

export interface ProjectSourceRangeRequest {
  readonly projectId: string;
  readonly sourceIndexRunId: string;
  readonly candidates: readonly ProjectSemanticSearchResult[];
  readonly maxSnippetBytes: number;
  readonly maxTotalBytes: number;
}

export interface ProjectSourceRangeResult {
  readonly status: "ready" | "unavailable";
  readonly snippets: readonly ProjectSourceSnippet[];
  readonly selectedBytes: number;
  readonly omittedCount: number;
  readonly omissionReasons: Readonly<Partial<Record<ProjectSourceRangeOmissionReason, number>>>;
  readonly unavailableReason?: ProjectSourceRangeOmissionReason;
}

type CachedSource =
  | {
      readonly status: "ready";
      readonly bytes: Buffer;
    }
  | {
      readonly status: "unavailable";
      readonly reason: ProjectSourceRangeOmissionReason;
    };

@Injectable()
export class ProjectSourceRangeService {
  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY)
    private readonly sourceIndexRepository: ProjectSourceIndexRepository,
    @Inject(SOURCE_TEXT_READER)
    private readonly sourceTextReader: SourceTextReader,
  ) {}

  public async rehydrate(input: ProjectSourceRangeRequest): Promise<ProjectSourceRangeResult> {
    const project = await this.projectRepository.findById(input.projectId);
    if (project === null) {
      return this.unavailable(input.candidates.length, "project_not_found");
    }

    const catalog = await this.sourceIndexRepository.getCurrentReadyCatalog(input.projectId);
    if (catalog === null) {
      return this.unavailable(input.candidates.length, "source_catalog_required");
    }
    if (catalog.run.id !== input.sourceIndexRunId) {
      return this.unavailable(input.candidates.length, "source_catalog_stale");
    }

    const files = new Map(catalog.files.map((file) => [file.id, file]));
    const sources = new Map<string, CachedSource>();
    const selectedRanges = new Map<string, { readonly startByte: number; readonly endByte: number }[]>();
    const snippets: ProjectSourceSnippet[] = [];
    const omissionReasons: Partial<Record<ProjectSourceRangeOmissionReason, number>> = {};
    let selectedBytes = 0;

    for (const candidate of input.candidates) {
      const file = files.get(candidate.sourceFileId);
      if (file === undefined) {
        increment(omissionReasons, "source_file_missing");
        continue;
      }
      if (file.relativePath !== candidate.path || file.contentHash !== candidate.sourceHash) {
        increment(omissionReasons, "source_identity_mismatch");
        continue;
      }

      const { startByte, endByte } = candidate.range;
      const snippetBytes = endByte - startByte;
      if (startByte < 0 || endByte <= startByte || endByte > file.sizeBytes) {
        increment(omissionReasons, "invalid_range");
        continue;
      }
      if (snippetBytes > input.maxSnippetBytes) {
        increment(omissionReasons, "snippet_too_large");
        continue;
      }
      if (selectedBytes + snippetBytes > input.maxTotalBytes) {
        increment(omissionReasons, "total_bytes_exceeded");
        continue;
      }

      const ranges = selectedRanges.get(file.id) ?? [];
      if (ranges.some((range) => startByte < range.endByte && endByte > range.startByte)) {
        increment(omissionReasons, "overlapping_range");
        continue;
      }

      let source = sources.get(file.id);
      if (source === undefined) {
        source = await this.readSource(project.rootPath, file);
        sources.set(file.id, source);
      }
      if (source.status === "unavailable") {
        increment(omissionReasons, source.reason);
        continue;
      }

      const bytes = source.bytes.subarray(startByte, endByte);
      if (hash(bytes) !== candidate.contentHash) {
        increment(omissionReasons, "content_hash_mismatch");
        continue;
      }

      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        increment(omissionReasons, "invalid_range");
        continue;
      }

      snippets.push({
        chunkId: candidate.chunkId,
        content,
        endLine: candidate.range.endLine + 1,
        language: candidate.language,
        relativePath: candidate.path,
        sizeBytes: snippetBytes,
        startLine: candidate.range.startLine + 1,
        symbolName: candidate.symbol?.qualifiedName ?? null,
      });
      ranges.push({ endByte, startByte });
      selectedRanges.set(file.id, ranges);
      selectedBytes += snippetBytes;
    }

    return {
      omissionReasons,
      omittedCount: sumReasons(omissionReasons),
      selectedBytes,
      snippets,
      status: "ready",
    };
  }

  private async readSource(rootPath: string, file: ReadyProjectSourceFile): Promise<CachedSource> {
    const result = await this.sourceTextReader.inspect({
      file: {
        modifiedAt: file.modifiedAt,
        path: file.relativePath,
        sizeBytes: file.sizeBytes,
      },
      maxFileBytes: file.sizeBytes,
      rootPath,
    });

    if (result.status !== "ready") {
      return { reason: "source_unavailable", status: "unavailable" };
    }
    if (result.contentHash !== file.contentHash) {
      return { reason: "source_hash_mismatch", status: "unavailable" };
    }

    return {
      bytes: Buffer.from(result.content, "utf8"),
      status: "ready",
    };
  }

  private unavailable(count: number, reason: ProjectSourceRangeOmissionReason): ProjectSourceRangeResult {
    return {
      omissionReasons: count === 0 ? {} : { [reason]: count },
      omittedCount: count,
      selectedBytes: 0,
      snippets: [],
      status: "unavailable",
      unavailableReason: reason,
    };
  }
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function increment(
  reasons: Partial<Record<ProjectSourceRangeOmissionReason, number>>,
  reason: ProjectSourceRangeOmissionReason,
): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function sumReasons(reasons: Readonly<Partial<Record<ProjectSourceRangeOmissionReason, number>>>): number {
  return Object.values(reasons).reduce((total, count) => total + count, 0);
}
