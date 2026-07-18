import type { ChatCancelCommand, ChatSendCommand } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { ChatSessionController } from "./ChatSessionController.js";
import type { ChatTransportEvent, ChatTransportPort, ChatTransportSubscription } from "./ChatTransportPort.js";
import { InMemoryChatSessionController } from "./InMemoryChatSessionController.js";
import type { ChatConnectionStatus } from "./chatWebview.contract.js";

const timestamp = "2026-07-18T12:00:00.000Z";

class FakeChatTransport implements ChatTransportPort {
  public readonly cancelled: ChatCancelCommand[] = [];
  public connectionStatus: ChatConnectionStatus = "idle";
  private readonly listeners = new Set<(event: ChatTransportEvent) => void>();
  public readonly sent: ChatSendCommand[] = [];

  public connect(): void {
    this.setConnectionStatus("connecting");
    this.setConnectionStatus("connected");
  }

  public send(command: ChatSendCommand): void {
    this.sent.push(command);
  }

  public cancel(command: ChatCancelCommand): void {
    this.cancelled.push(command);
  }

  public subscribe(listener: (event: ChatTransportEvent) => void): ChatTransportSubscription {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  public dispose(): void {
    this.listeners.clear();
  }

  public emit(event: ChatTransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public setConnectionStatus(status: ChatConnectionStatus): void {
    this.connectionStatus = status;
    this.emit({ status, type: "connection-status" });
  }
}

function createSession(
  identifiers = ["session-1", "request-1", "assistant-1", "user-1"],
): InMemoryChatSessionController {
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

describe("ChatSessionController", () => {
  it("sends a correlated command and forwards an ordered stream", () => {
    const transport = new FakeChatTransport();
    const controller = new ChatSessionController({ session: createSession(), transport });
    const events: string[] = [];
    controller.subscribe((event) => {
      events.push(event.type);
    });

    controller.connect();
    controller.submit("Explain this function");

    expect(transport.sent).toEqual([
      {
        messages: [{ content: "Explain this function", role: "user" }],
        requestId: "request-1",
        sessionId: "session-1",
      },
    ]);

    transport.emit({
      payload: { requestId: "request-1", sessionId: "session-1" },
      type: "accepted",
    });
    transport.emit({
      payload: { content: "It returns ", requestId: "request-1", sessionId: "session-1" },
      type: "delta",
    });
    transport.emit({
      payload: { content: "a value.", requestId: "request-1", sessionId: "session-1" },
      type: "delta",
    });
    transport.emit({
      payload: { requestId: "request-1", sessionId: "session-1" },
      type: "completed",
    });

    expect(controller.getSnapshot()).toMatchObject({ activeGeneration: null });
    expect(controller.getSnapshot().messages[1]).toMatchObject({
      content: "It returns a value.",
      status: "completed",
    });
    expect(events).toEqual([
      "chat:connection-updated",
      "chat:connection-updated",
      "chat:submitted",
      "chat:generation-started",
      "chat:generation-delta",
      "chat:generation-delta",
      "chat:generation-completed",
    ]);
  });

  it("forwards cancellation and waits for the backend cancellation event", () => {
    const transport = new FakeChatTransport();
    const controller = new ChatSessionController({ session: createSession(), transport });
    controller.connect();
    controller.submit("Explain this function");
    transport.emit({
      payload: { requestId: "request-1", sessionId: "session-1" },
      type: "accepted",
    });

    controller.cancelActiveGeneration();

    expect(transport.cancelled).toEqual([{ requestId: "request-1", sessionId: "session-1" }]);
    expect(controller.getSnapshot().activeGeneration).toMatchObject({ requestId: "request-1" });

    transport.emit({
      payload: { requestId: "request-1", sessionId: "session-1" },
      type: "cancelled",
    });

    expect(controller.getSnapshot()).toMatchObject({ activeGeneration: null });
    expect(controller.getSnapshot().messages[1]).toMatchObject({ status: "cancelled" });
  });

  it("ignores malformed and stale events, then fails an active generation on disconnect", () => {
    const transport = new FakeChatTransport();
    const controller = new ChatSessionController({ session: createSession(), transport });
    controller.connect();
    controller.submit("Explain this function");
    transport.emit({
      payload: { requestId: "request-1", sessionId: "session-1" },
      type: "accepted",
    });
    const beforeStaleEvents = controller.getSnapshot();

    transport.emit({ eventName: "chat:delta", type: "malformed-event" });
    transport.emit({
      payload: { content: "stale", requestId: "request-other", sessionId: "session-1" },
      type: "delta",
    });

    expect(controller.getSnapshot()).toEqual(beforeStaleEvents);

    transport.setConnectionStatus("disconnected");

    expect(controller.getSnapshot()).toMatchObject({ activeGeneration: null });
    expect(controller.getSnapshot().messages[1]).toMatchObject({
      error: { code: "connection_unavailable", retryable: true },
      status: "failed",
    });
  });

  it("does not resend after a backend restart and accepts an explicit follow-up prompt", () => {
    const transport = new FakeChatTransport();
    const controller = new ChatSessionController({
      session: createSession(["session-1", "request-1", "assistant-1", "user-1", "request-2", "assistant-2", "user-2"]),
      transport,
    });

    controller.connect();
    controller.submit("First request");
    transport.emit({
      payload: { requestId: "request-1", sessionId: "session-1" },
      type: "accepted",
    });
    transport.setConnectionStatus("disconnected");
    transport.setConnectionStatus("connecting");
    transport.setConnectionStatus("connected");

    expect(transport.sent).toHaveLength(1);
    expect(controller.getSnapshot().messages[1]).toMatchObject({ status: "failed" });

    transport.emit({
      payload: { content: "late output", requestId: "request-1", sessionId: "session-1" },
      type: "delta",
    });
    transport.emit({
      payload: { requestId: "request-1", sessionId: "session-1" },
      type: "completed",
    });
    controller.submit("Second request");

    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[1]).toMatchObject({
      requestId: "request-2",
      sessionId: "session-1",
    });
    expect(controller.getSnapshot().activeGeneration).toMatchObject({ requestId: "request-2" });
  });
});
