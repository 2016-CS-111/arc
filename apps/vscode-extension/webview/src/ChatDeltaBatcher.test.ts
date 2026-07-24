import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatDeltaBatcher, type BatchedChatDelta } from "./ChatDeltaBatcher.js";

describe("ChatDeltaBatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("combines rapid deltas for a request into one render update", () => {
    vi.useFakeTimers();
    const flushed: BatchedChatDelta[] = [];
    const batcher = new ChatDeltaBatcher((delta) => flushed.push(delta), 40);

    batcher.append("request-1", "Arc ");
    batcher.append("request-1", "streams ");
    batcher.append("request-1", "smoothly.");
    vi.advanceTimersByTime(39);
    expect(flushed).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(flushed).toEqual([{ content: "Arc streams smoothly.", requestId: "request-1" }]);
  });

  it("flushes pending content before a terminal generation event", () => {
    vi.useFakeTimers();
    const flushed: BatchedChatDelta[] = [];
    const batcher = new ChatDeltaBatcher((delta) => flushed.push(delta), 40);

    batcher.append("request-1", "final tokens");
    batcher.flush("request-1");
    vi.runAllTimers();

    expect(flushed).toEqual([{ content: "final tokens", requestId: "request-1" }]);
  });

  it("drops queued deltas when the active session is replaced", () => {
    vi.useFakeTimers();
    const flushed: BatchedChatDelta[] = [];
    const batcher = new ChatDeltaBatcher((delta) => flushed.push(delta), 40);

    batcher.append("stale-request", "stale content");
    batcher.clear();
    vi.runAllTimers();

    expect(flushed).toEqual([]);
  });
});
