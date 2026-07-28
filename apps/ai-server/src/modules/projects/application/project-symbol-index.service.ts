import {
  LatestProjectSymbolIndexResponseSchema,
  type LatestProjectSymbolIndexResponse,
  type ProjectSymbolFileErrorCode,
  type ProjectSymbolIndex,
  type ProjectSymbolIndexErrorCode,
  type ProjectSymbolIndexLimitReason,
} from "@arc/contracts";
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import {
  PROJECT_INVENTORY_REPOSITORY,
  PROJECT_REPOSITORY,
  PROJECT_SOURCE_INDEX_REPOSITORY,
  PROJECT_SYMBOL_INDEX_REPOSITORY,
  SOURCE_SYMBOL_EXTRACTOR,
  SOURCE_TEXT_READER,
} from "../projects.constants.js";
import type { ReadyProjectSourceFile } from "../domain/project-source-index.types.js";
import type {
  CurrentProjectSymbolFile,
  ProjectSymbolFileOutcome,
  SourceSymbolLanguage,
} from "../domain/project-symbol-index.types.js";
import {
  ProjectNotFoundError,
  ProjectSourceCatalogRequiredError,
  ProjectSourceCatalogStaleError,
  ProjectSymbolIndexAlreadyRunningError,
  ProjectSymbolIndexFailedError,
} from "../domain/project.errors.js";
import type { ProjectInventoryRepository } from "./project-inventory.repository.js";
import type { ProjectRepository } from "./project.repository.js";
import type { ProjectSourceIndexRepository } from "./project-source-index.repository.js";
import type { ProjectSymbolIndexRepository } from "./project-symbol-index.repository.js";
import type { SourceSymbolExtractor } from "./source-symbol.extractor.js";
import type { SourceTextReader } from "./source-text.reader.js";

const reusableStatuses = new Set(["parsed", "parsed_with_errors", "unsupported"]);

@Injectable()
export class ProjectSymbolIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectSymbolIndexService.name);

  public constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PROJECT_INVENTORY_REPOSITORY)
    private readonly inventoryRepository: ProjectInventoryRepository,
    @Inject(PROJECT_SOURCE_INDEX_REPOSITORY)
    private readonly sourceIndexRepository: ProjectSourceIndexRepository,
    @Inject(PROJECT_SYMBOL_INDEX_REPOSITORY)
    private readonly symbolIndexRepository: ProjectSymbolIndexRepository,
    @Inject(SOURCE_TEXT_READER)
    private readonly sourceTextReader: SourceTextReader,
    @Inject(SOURCE_SYMBOL_EXTRACTOR)
    private readonly symbolExtractor: SourceSymbolExtractor,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const recoveredCount = await this.symbolIndexRepository.recoverInterruptedIndexes();
      if (recoveredCount > 0) {
        this.logger.warn("Recovered interrupted Arc project symbol indexes.", { recoveredCount });
      }
    } catch {
      this.logger.warn("Could not recover interrupted Arc project symbol indexes.");
    }
  }

  public async index(projectId: string): Promise<ProjectSymbolIndex> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const [inventory, sourceCatalog, latestSourceRun] = await Promise.all([
      this.inventoryRepository.getCurrentSnapshot(projectId),
      this.sourceIndexRepository.getCurrentReadyCatalog(projectId),
      this.sourceIndexRepository.getLatestRun(projectId),
    ]);
    if (sourceCatalog === null) {
      throw new ProjectSourceCatalogRequiredError(projectId);
    }
    if (inventory?.scan.id !== sourceCatalog.run.inventoryScanId || latestSourceRun?.status === "running") {
      throw new ProjectSourceCatalogStaleError(projectId);
    }

    let run: ProjectSymbolIndex;
    try {
      run = await this.symbolIndexRepository.beginIndex(projectId, sourceCatalog.run.id);
    } catch (error) {
      if (error instanceof ProjectSymbolIndexAlreadyRunningError) {
        throw error;
      }
      throw new ProjectSymbolIndexFailedError();
    }

    try {
      const currentFiles = await this.symbolIndexRepository.getCurrentFiles(projectId);
      const publication = await this.buildPublication(project.rootPath, sourceCatalog.files, currentFiles);
      return await this.symbolIndexRepository.publishIndex({
        ...publication,
        batchSize: this.config.projectSymbol.batchSize,
        projectId,
        sourceIndexRunId: sourceCatalog.run.id,
        symbolIndexId: run.id,
      });
    } catch (error) {
      const errorCode = this.isParserUnavailable(error) ? "parser_unavailable" : "symbol_persistence_error";
      await this.recordFailure(run, errorCode);
      throw new ProjectSymbolIndexFailedError();
    }
  }

  public async getLatest(projectId: string): Promise<LatestProjectSymbolIndexResponse> {
    const project = await this.projectRepository.findById(projectId);
    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const [latestRun, currentCatalogRun, currentSourceRun] = await Promise.all([
      this.symbolIndexRepository.getLatestRun(projectId),
      this.symbolIndexRepository.getCurrentCatalogRun(projectId),
      this.sourceIndexRepository.getCurrentCatalogRun(projectId),
    ]);

    return LatestProjectSymbolIndexResponseSchema.parse({
      currentCatalog:
        currentCatalogRun === null
          ? null
          : {
              completedAt: currentCatalogRun.completedAt,
              failedFileCount: currentCatalogRun.failedFileCount,
              omittedSymbolCount: currentCatalogRun.omittedSymbolCount,
              parsedFileCount: currentCatalogRun.parsedFileCount,
              reusedFileCount: currentCatalogRun.reusedFileCount,
              sourceIndexRunId: currentCatalogRun.sourceIndexRunId,
              stale: currentSourceRun?.id !== currentCatalogRun.sourceIndexRunId,
              symbolCount: currentCatalogRun.symbolCount,
              symbolIndexId: currentCatalogRun.id,
              unsupportedFileCount: currentCatalogRun.unsupportedFileCount,
            },
      latestRun,
    });
  }

  private async buildPublication(
    rootPath: string,
    sourceFiles: readonly ReadyProjectSourceFile[],
    currentFiles: readonly CurrentProjectSymbolFile[],
  ) {
    const currentBySourceFile = new Map(currentFiles.map((file) => [file.sourceFileId, file]));
    const files: ProjectSymbolFileOutcome[] = [];
    const reusedSourceFileIds: string[] = [];
    const limitReasons = new Set<ProjectSymbolIndexLimitReason>();
    let parsedFileCount = 0;
    let reusedFileCount = 0;
    let unsupportedFileCount = 0;
    let failedFileCount = 0;
    let symbolCount = 0;
    let omittedSymbolCount = 0;

    for (const [index, sourceFile] of sourceFiles.entries()) {
      const supported = this.symbolExtractor.supports(sourceFile.language);
      const parserIdentity = supported
        ? this.parserIdentity(sourceFile.language)
        : `unsupported:${sourceFile.language}`;
      const current = currentBySourceFile.get(sourceFile.id);

      if (
        current !== undefined &&
        reusableStatuses.has(current.status) &&
        current.sourceContentHash === sourceFile.contentHash &&
        current.language === sourceFile.language &&
        current.parserIdentity === parserIdentity &&
        (!supported || symbolCount + current.symbolCount <= this.config.projectSymbol.maxTotalSymbols)
      ) {
        reusedSourceFileIds.push(sourceFile.id);
        reusedFileCount += 1;
        symbolCount += current.symbolCount;
        omittedSymbolCount += current.omittedSymbolCount;
        if (current.status === "unsupported") {
          unsupportedFileCount += 1;
        }
      } else if (!supported) {
        files.push(this.unsupportedOutcome(sourceFile, parserIdentity));
        unsupportedFileCount += 1;
      } else if (symbolCount >= this.config.projectSymbol.maxTotalSymbols) {
        files.push(this.limitedOutcome(sourceFile, parserIdentity));
        limitReasons.add("total_symbols");
      } else {
        const outcome = await this.extractFile(
          rootPath,
          sourceFile,
          parserIdentity,
          this.config.projectSymbol.maxTotalSymbols - symbolCount,
        );
        files.push(outcome);
        parsedFileCount += outcome.status === "failed" ? 0 : 1;
        failedFileCount += outcome.status === "failed" ? 1 : 0;
        symbolCount += outcome.symbolCount;
        omittedSymbolCount += outcome.omittedSymbolCount;
        if (outcome.status === "limited" && outcome.errorCode === "symbol_limit") {
          const constrainedByRun =
            this.config.projectSymbol.maxTotalSymbols - (symbolCount - outcome.symbolCount) <
            this.config.projectSymbol.maxSymbolsPerFile;
          if (constrainedByRun) {
            limitReasons.add("total_symbols");
          }
        }
      }

      if ((index + 1) % this.config.projectSymbol.yieldEveryFiles === 0) {
        await yieldToEventLoop();
      }
    }

    return {
      failedFileCount,
      files,
      limitReasons: [...limitReasons],
      omittedSymbolCount,
      parsedFileCount,
      reusedFileCount,
      reusedSourceFileIds,
      symbolCount,
      unsupportedFileCount,
    };
  }

  private async extractFile(
    rootPath: string,
    sourceFile: ReadyProjectSourceFile,
    parserIdentity: string,
    remainingSymbolCapacity: number,
  ): Promise<ProjectSymbolFileOutcome> {
    const result = await this.sourceTextReader.inspect({
      file: {
        modifiedAt: sourceFile.modifiedAt,
        path: sourceFile.relativePath,
        sizeBytes: sourceFile.sizeBytes,
      },
      maxFileBytes: this.config.projectSource.maxFileBytes,
      rootPath,
    });
    if (result.status !== "ready") {
      return this.failedOutcome(sourceFile, parserIdentity, "source_read_error");
    }
    if (result.contentHash !== sourceFile.contentHash) {
      return this.failedOutcome(sourceFile, parserIdentity, "source_changed");
    }

    try {
      const extraction = this.symbolExtractor.extract({
        language: sourceFile.language as SourceSymbolLanguage,
        limits: {
          maxNameBytes: this.config.projectSymbol.maxNameBytes,
          maxQualifiedNameBytes: this.config.projectSymbol.maxQualifiedNameBytes,
          maxSymbols: Math.min(this.config.projectSymbol.maxSymbolsPerFile, remainingSymbolCapacity),
        },
        source: result.content,
      });
      const errorCode = this.limitError(extraction.limitReasons);
      return {
        errorCode,
        hasSyntaxErrors: extraction.hasSyntaxErrors,
        language: sourceFile.language,
        omittedSymbolCount: extraction.omittedSymbolCount,
        parserIdentity,
        relativePath: sourceFile.relativePath,
        sourceContentHash: sourceFile.contentHash,
        sourceFileId: sourceFile.id,
        status: errorCode !== null ? "limited" : extraction.hasSyntaxErrors ? "parsed_with_errors" : "parsed",
        symbolCount: extraction.symbols.length,
        symbols: extraction.symbols,
      };
    } catch {
      return this.failedOutcome(sourceFile, parserIdentity, "parse_error");
    }
  }

  private parserIdentity(language: SourceSymbolLanguage): string {
    try {
      return [
        this.symbolExtractor.getParserIdentity(language),
        `symbols=${String(this.config.projectSymbol.maxSymbolsPerFile)}`,
        `name=${String(this.config.projectSymbol.maxNameBytes)}`,
        `qualified=${String(this.config.projectSymbol.maxQualifiedNameBytes)}`,
      ].join("/");
    } catch (error) {
      throw new ParserUnavailableError(error);
    }
  }

  private unsupportedOutcome(sourceFile: ReadyProjectSourceFile, parserIdentity: string): ProjectSymbolFileOutcome {
    return {
      errorCode: "unsupported_language",
      hasSyntaxErrors: false,
      language: sourceFile.language,
      omittedSymbolCount: 0,
      parserIdentity,
      relativePath: sourceFile.relativePath,
      sourceContentHash: sourceFile.contentHash,
      sourceFileId: sourceFile.id,
      status: "unsupported",
      symbolCount: 0,
      symbols: [],
    };
  }

  private limitedOutcome(sourceFile: ReadyProjectSourceFile, parserIdentity: string): ProjectSymbolFileOutcome {
    return {
      errorCode: "symbol_limit",
      hasSyntaxErrors: false,
      language: sourceFile.language,
      omittedSymbolCount: 0,
      parserIdentity,
      relativePath: sourceFile.relativePath,
      sourceContentHash: sourceFile.contentHash,
      sourceFileId: sourceFile.id,
      status: "limited",
      symbolCount: 0,
      symbols: [],
    };
  }

  private failedOutcome(
    sourceFile: ReadyProjectSourceFile,
    parserIdentity: string,
    errorCode: Extract<ProjectSymbolFileErrorCode, "source_changed" | "source_read_error" | "parse_error">,
  ): ProjectSymbolFileOutcome {
    return {
      errorCode,
      hasSyntaxErrors: false,
      language: sourceFile.language,
      omittedSymbolCount: 0,
      parserIdentity,
      relativePath: sourceFile.relativePath,
      sourceContentHash: sourceFile.contentHash,
      sourceFileId: sourceFile.id,
      status: "failed",
      symbolCount: 0,
      symbols: [],
    };
  }

  private limitError(
    reasons: readonly ("symbol_limit" | "symbol_text_limit")[],
  ): Extract<ProjectSymbolFileErrorCode, "symbol_limit" | "symbol_text_limit"> | null {
    return reasons.includes("symbol_limit")
      ? "symbol_limit"
      : reasons.includes("symbol_text_limit")
        ? "symbol_text_limit"
        : null;
  }

  private isParserUnavailable(error: unknown): boolean {
    return error instanceof ParserUnavailableError;
  }

  private async recordFailure(run: ProjectSymbolIndex, errorCode: ProjectSymbolIndexErrorCode): Promise<void> {
    try {
      await this.symbolIndexRepository.failIndex({
        errorCode,
        projectId: run.projectId,
        symbolIndexId: run.id,
      });
    } catch {
      this.logger.error("Arc could not persist project symbol index failure state.", {
        projectId: run.projectId,
        symbolIndexId: run.id,
      });
    }
  }
}

class ParserUnavailableError extends Error {
  public constructor(cause: unknown) {
    super("Arc symbol parser is unavailable.", { cause });
    this.name = "ParserUnavailableError";
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
