import { afterEach, describe, expect, it, vi } from "vitest";

import { GenerationWatchdog } from "./GenerationWatchdog.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("GenerationWatchdog", () => {
  it("expires the active generation after the safety interval", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new GenerationWatchdog(1_000);

    watchdog.arm("request-1", onTimeout);
    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("extends the interval when matching model activity arrives", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new GenerationWatchdog(1_000);

    watchdog.arm("request-1", onTimeout);
    vi.advanceTimersByTime(750);
    watchdog.touch("request-1");
    vi.advanceTimersByTime(750);

    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("ignores stale activity and clears only the matching request", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new GenerationWatchdog(1_000);

    watchdog.arm("request-1", onTimeout);
    watchdog.touch("request-other");
    watchdog.clear("request-other");
    vi.advanceTimersByTime(1_000);

    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
