import type { ChatErrorCode } from "@arc/contracts";
import type { Logger, LogContext } from "@arc/shared";

export interface ChatGenerationCorrelation {
  readonly requestId: string;
  readonly sessionId: string;
}

export type ChatGenerationMode = "new" | "existing";

export class ChatGenerationLifecycleLogger {
  private acceptedLogged = false;
  private readonly startedAtMs: number;
  private startedLogged = false;
  private terminalLogged = false;

  public constructor(
    private readonly logger: Logger,
    private readonly correlation: ChatGenerationCorrelation,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAtMs = this.now();
  }

  public started(): void {
    if (this.startedLogged) {
      return;
    }

    this.startedLogged = true;
    this.logger.info("Chat generation started", this.createContext("started"));
  }

  public accepted(mode: ChatGenerationMode): void {
    if (this.acceptedLogged || this.terminalLogged) {
      return;
    }

    this.acceptedLogged = true;
    this.logger.info("Chat generation accepted", {
      ...this.createContext("accepted"),
      mode,
    });
  }

  public completed(): void {
    this.finish("completed");
  }

  public cancelled(): void {
    this.finish("cancelled");
  }

  public failed(errorCode: ChatErrorCode): void {
    this.finish("failed", errorCode);
  }

  private finish(status: "completed" | "cancelled" | "failed", errorCode?: ChatErrorCode): void {
    if (this.terminalLogged) {
      return;
    }

    this.terminalLogged = true;
    const context: LogContext = {
      ...this.createContext(status),
      ...(errorCode === undefined ? {} : { errorCode }),
    };

    if (status === "failed") {
      this.logger.warn("Chat generation failed", context);
      return;
    }

    this.logger.info(`Chat generation ${status}`, context);
  }

  private createContext(status: string): LogContext {
    return {
      durationMs: Math.max(0, this.now() - this.startedAtMs),
      requestId: this.correlation.requestId,
      sessionId: this.correlation.sessionId,
      status,
    };
  }
}
