export const CHAT_GENERATION_SAFETY_TIMEOUT_MS = 330_000;

interface ActiveWatch {
  readonly onTimeout: () => void;
  readonly requestId: string;
}

export class GenerationWatchdog {
  private activeWatch: ActiveWatch | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly timeoutMs = CHAT_GENERATION_SAFETY_TIMEOUT_MS) {}

  public arm(requestId: string, onTimeout: () => void): void {
    this.clear();
    this.activeWatch = { onTimeout, requestId };
    this.schedule();
  }

  public touch(requestId: string): void {
    if (this.activeWatch?.requestId !== requestId) {
      return;
    }

    this.clearTimer();
    this.schedule();
  }

  public clear(requestId?: string): void {
    if (requestId !== undefined && this.activeWatch?.requestId !== requestId) {
      return;
    }

    this.clearTimer();
    this.activeWatch = undefined;
  }

  public dispose(): void {
    this.clear();
  }

  private schedule(): void {
    const watchedRequest = this.activeWatch;
    if (watchedRequest === undefined) {
      return;
    }

    this.timer = setTimeout(() => {
      if (this.activeWatch !== watchedRequest) {
        return;
      }

      this.timer = undefined;
      this.activeWatch = undefined;
      watchedRequest.onTimeout();
    }, this.timeoutMs);
  }

  private clearTimer(): void {
    if (this.timer === undefined) {
      return;
    }

    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
