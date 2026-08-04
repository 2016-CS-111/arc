import { Inject, Injectable } from "@nestjs/common";

import { PROJECT_SYMBOL_INDEX_REPOSITORY } from "../projects.constants.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";

@Injectable()
export class ProjectSymbolSearchService {
  public constructor(
    @Inject(PROJECT_SYMBOL_INDEX_REPOSITORY)
    private readonly symbolIndexRepository: ProjectSymbolIndexRepository,
  ) {}

  public async search(projectId: string, query: string, limit: number, signal: AbortSignal): Promise<unknown> {
    const catalog = await this.symbolIndexRepository.getCurrentCatalogRun(projectId);
    if (catalog === null) {
      return { available: false, reason: "symbol_catalog_unavailable" };
    }

    const normalizedQuery = query.toLowerCase();
    const results: unknown[] = [];
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;
    let scannedCount = 0;

    while (hasMore && scannedCount < 1_000 && results.length < limit) {
      this.throwIfCancelled(signal);
      const page = await this.symbolIndexRepository.listCatalogSymbols({
        limit: pageSize,
        offset,
        projectId,
        symbolIndexId: catalog.id,
      });
      scannedCount += page.symbols.length;
      for (const symbol of page.symbols) {
        if (results.length >= limit) {
          break;
        }
        if (!symbol.name.toLowerCase().includes(normalizedQuery) && !symbol.qualifiedName.toLowerCase().includes(normalizedQuery)) {
          continue;
        }
        results.push({
          citation: {
            endLine: symbol.range.endLine + 1,
            path: symbol.relativePath,
            startLine: symbol.range.startLine + 1,
          },
          kind: symbol.kind,
          name: symbol.qualifiedName.slice(0, 256),
          exported: symbol.exported,
        });
      }
      hasMore = page.hasMore;
      offset += page.symbols.length;
      if (page.symbols.length === 0) {
        break;
      }
    }

    return {
      available: true,
      results,
      truncated: hasMore || scannedCount >= 1_000,
    };
  }

  private throwIfCancelled(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error("Arc symbol search was cancelled.");
    }
  }
}
