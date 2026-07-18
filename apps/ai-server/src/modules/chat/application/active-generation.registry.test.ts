import { describe, expect, it } from "vitest";

import { ActiveGenerationRegistry } from "./active-generation.registry.js";

const firstScope = {
  clientId: "client_1",
  sessionId: "session_1",
  requestId: "request_1",
};

describe("ActiveGenerationRegistry", () => {
  it("allows one active generation per durable session", () => {
    const registry = new ActiveGenerationRegistry();

    const controller = registry.start(firstScope);
    const duplicate = registry.start({
      ...firstScope,
      requestId: "request_2",
    });

    expect(controller).toBeInstanceOf(AbortController);
    expect(duplicate).toBeUndefined();
  });

  it("cancels only the matching request", () => {
    const registry = new ActiveGenerationRegistry();
    const controller = registry.start(firstScope);

    expect(registry.cancel({ ...firstScope, requestId: "request_2" })).toBe(false);
    expect(controller?.signal.aborted).toBe(false);

    expect(registry.cancel(firstScope)).toBe(true);
    expect(controller?.signal.aborted).toBe(true);
  });

  it("cancels all active requests when a client disconnects", () => {
    const registry = new ActiveGenerationRegistry();
    const firstController = registry.start(firstScope);
    const secondController = registry.start({
      clientId: "client_1",
      sessionId: "session_2",
      requestId: "request_2",
    });
    const otherClientController = registry.start({
      clientId: "client_2",
      sessionId: "session_3",
      requestId: "request_3",
    });

    registry.cancelAllForClient("client_1");

    expect(firstController?.signal.aborted).toBe(true);
    expect(secondController?.signal.aborted).toBe(true);
    expect(otherClientController?.signal.aborted).toBe(false);
  });
});
