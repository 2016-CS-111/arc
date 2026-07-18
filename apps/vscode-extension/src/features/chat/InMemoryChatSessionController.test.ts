import { describe, expect, it } from "vitest";

import { InMemoryChatSessionController } from "./InMemoryChatSessionController.js";

const timestamp = "2026-07-18T12:00:00.000Z";

function createController(): InMemoryChatSessionController {
  const identifiers = ["session-1", "request-1", "assistant-1", "user-1", "request-2", "assistant-2", "user-2"];

  return new InMemoryChatSessionController({
    createId: () => {
      const identifier = identifiers.shift();
      if (identifier === undefined) {
        throw new Error("No test identifier remains.");
      }

      return identifier;
    },
    now: () => timestamp,
  });
}

describe("InMemoryChatSessionController", () => {
  it("hydrates a submitted prompt through streaming completion", () => {
    const controller = createController();
    const submission = controller.submit(" Explain this function ");

    expect(submission).toMatchObject({ requestId: "request-1" });
    expect(submission?.session.messages).toMatchObject([
      {
        content: "Explain this function",
        id: "user-1",
        role: "user",
        status: "completed",
      },
      {
        content: "",
        id: "assistant-1",
        role: "assistant",
        status: "pending",
      },
    ]);

    expect(controller.startGeneration("request-1")?.messages[1]).toMatchObject({
      status: "streaming",
    });
    controller.appendDelta("request-1", "It returns ");
    controller.appendDelta("request-1", "a value.");
    const completed = controller.complete("request-1");

    expect(completed).toMatchObject({ activeGeneration: null });
    expect(completed?.messages[1]).toMatchObject({
      content: "It returns a value.",
      status: "completed",
    });
  });

  it("ignores stale events without mutating the active generation", () => {
    const controller = createController();
    controller.submit("Explain this function");
    controller.startGeneration("request-1");
    const beforeStaleEvent = controller.getSnapshot();

    expect(controller.appendDelta("request-other", "stale")).toBeUndefined();
    expect(controller.complete("request-other")).toBeUndefined();
    expect(controller.getSnapshot()).toEqual(beforeStaleEvent);
  });

  it("marks an active generation as cancelled and allows a new prompt", () => {
    const controller = createController();
    controller.submit("Explain this function");
    const cancelled = controller.cancel("request-1");

    expect(cancelled).toMatchObject({ activeGeneration: null });
    expect(cancelled?.messages[1]).toMatchObject({ status: "cancelled" });
    expect(controller.submit("Try again")).toMatchObject({ requestId: "request-2" });
  });

  it("preserves partial output when a generation fails", () => {
    const controller = createController();
    controller.submit("Explain this function");
    controller.startGeneration("request-1");
    controller.appendDelta("request-1", "Partial output");

    const failed = controller.fail("request-1", {
      code: "provider_unavailable",
      message: "Ollama is unavailable.",
      retryable: true,
    });

    expect(failed).toMatchObject({ activeGeneration: null });
    expect(failed?.messages[1]).toMatchObject({
      content: "Partial output",
      error: {
        code: "provider_unavailable",
        retryable: true,
      },
      status: "failed",
    });
  });
});
