import * as vscode from "vscode";

import type { CompletionClientPort } from "../../infrastructure/backend/CompletionClient.js";
import { InlineCompletionContextBuilder } from "./InlineCompletionContextBuilder.js";

interface CompletionMetricSnapshot {
  readonly averageLatencyMs: number | null;
  readonly cancelledCount: number;
  readonly requestCount: number;
}

export class ArcInlineCompletionProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
  private readonly cache = new Map<string, string>();
  private readonly activeRequests = new Map<string, AbortController>();
  private cancelledCount = 0;
  private requestCount = 0;
  private totalLatencyMs = 0;

  public constructor(
    private readonly completionClient: CompletionClientPort,
    private readonly projectIdProvider: () => string | undefined,
    private readonly contextBuilder = new InlineCompletionContextBuilder(),
  ) {}

  public dispose(): void {
    for (const controller of this.activeRequests.values()) controller.abort();
    this.activeRequests.clear();
    this.cache.clear();
  }

  public getMetrics(): CompletionMetricSnapshot {
    return {
      averageLatencyMs: this.requestCount === 0 ? null : Math.round(this.totalLatencyMs / this.requestCount),
      cancelledCount: this.cancelledCount,
      requestCount: this.requestCount,
    };
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    if (
      !vscode.workspace.getConfiguration("arc").get<boolean>("inlineCompletions.enabled", true) ||
      token.isCancellationRequested
    ) {
      return [];
    }
    const request = this.contextBuilder.build(document, position, this.projectIdProvider());
    const key = cacheKey(document, position, request.prefix, request.suffix);
    const cached = this.cache.get(key);
    if (cached !== undefined) return toItems(cached, position);

    const documentKey = document.uri.toString();
    this.activeRequests.get(documentKey)?.abort();
    const controller = new AbortController();
    this.activeRequests.set(documentKey, controller);
    const cancellation = token.onCancellationRequested(() => {
      controller.abort();
    });
    const version = document.version;
    const startedAt = performance.now();
    try {
      await delay(
        vscode.workspace.getConfiguration("arc").get<number>("inlineCompletions.debounceMs", 120),
        controller.signal,
      );
      const response = await this.completionClient.complete(request, controller.signal);
      this.requestCount += 1;
      this.totalLatencyMs += Math.round(performance.now() - startedAt);
      if (controller.signal.aborted || document.version !== version || response.completion.length === 0) {
        return [];
      }
      this.remember(key, response.completion);
      return toItems(response.completion, position);
    } catch {
      if (controller.signal.aborted) this.cancelledCount += 1;
      return [];
    } finally {
      cancellation.dispose();
      if (this.activeRequests.get(documentKey) === controller) this.activeRequests.delete(documentKey);
    }
  }

  private remember(key: string, completion: string): void {
    this.cache.set(key, completion);
    if (this.cache.size <= 50) return;
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) this.cache.delete(firstKey);
  }
}

function cacheKey(document: vscode.TextDocument, position: vscode.Position, prefix: string, suffix: string): string {
  return `${document.uri.toString()}:${String(document.version)}:${String(position.line)}:${String(position.character)}:${prefix}:${suffix}`;
}

function toItems(completion: string, position: vscode.Position): vscode.InlineCompletionItem[] {
  return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("Arc completion was cancelled."));
      },
      { once: true },
    );
  });
}
