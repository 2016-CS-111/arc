export interface BatchedChatDelta {
  readonly content: string;
  readonly requestId: string;
}

export class ChatDeltaBatcher {
  private readonly pendingContent = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly onFlush: (delta: BatchedChatDelta) => void,
    private readonly intervalMs = 40,
  ) {}

  public append(requestId: string, content: string): void {
    this.pendingContent.set(requestId, `${this.pendingContent.get(requestId) ?? ""}${content}`);
    this.timer ??= setTimeout(() => {
      this.flushAll();
    }, this.intervalMs);
  }

  public flush(requestId: string): void {
    const content = this.pendingContent.get(requestId);
    if (content === undefined) {
      return;
    }

    this.pendingContent.delete(requestId);
    if (this.pendingContent.size === 0) {
      this.clearTimer();
    }
    this.onFlush({ content, requestId });
  }

  public clear(): void {
    this.pendingContent.clear();
    this.clearTimer();
  }

  public dispose(): void {
    this.clear();
  }

  private flushAll(): void {
    const deltas = [...this.pendingContent.entries()];
    this.pendingContent.clear();
    this.timer = undefined;

    for (const [requestId, content] of deltas) {
      this.onFlush({ content, requestId });
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
