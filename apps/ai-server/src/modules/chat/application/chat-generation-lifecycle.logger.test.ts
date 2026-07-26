import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import { ChatGenerationLifecycleLogger } from "./chat-generation-lifecycle.logger.js";

function createLogger(): {
  readonly info: ReturnType<typeof vi.fn>;
  readonly logger: Logger;
  readonly warn: ReturnType<typeof vi.fn>;
} {
  const info = vi.fn();
  const warn = vi.fn();
  return {
    info,
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info,
      warn,
    },
    warn,
  };
}

describe("ChatGenerationLifecycleLogger", () => {
  it("logs correlation, mode, duration, and one terminal status", () => {
    const { info, logger, warn } = createLogger();
    let now = 100;
    const lifecycle = new ChatGenerationLifecycleLogger(
      logger,
      { requestId: "request-1", sessionId: "session-1" },
      () => now,
    );

    lifecycle.started();
    now = 125;
    lifecycle.accepted("new");
    now = 460;
    lifecycle.failed("generation_timeout");
    lifecycle.completed();

    expect(info).toHaveBeenNthCalledWith(1, "Chat generation started", {
      durationMs: 0,
      requestId: "request-1",
      sessionId: "session-1",
      status: "started",
    });
    expect(info).toHaveBeenNthCalledWith(2, "Chat generation accepted", {
      durationMs: 25,
      mode: "new",
      requestId: "request-1",
      sessionId: "session-1",
      status: "accepted",
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Chat generation failed", {
      durationMs: 360,
      errorCode: "generation_timeout",
      requestId: "request-1",
      sessionId: "session-1",
      status: "failed",
    });
    expect(info).toHaveBeenCalledTimes(2);
  });
});
