import type {
  ChatCancelCommand,
  ChatSendCommand,
  ConversationSession,
  ConversationSessionSnapshot,
  ConversationSessionSummary,
} from "@arc/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatSessionController } from "./ChatSessionController.js";
import type { ChatTransportEvent, ChatTransportPort, ChatTransportSubscription } from "./ChatTransportPort.js";
import { GenerationWatchdog } from "./GenerationWatchdog.js";
import { InMemoryChatSessionController } from "./InMemoryChatSessionController.js";
import type { ChatConnectionStatus } from "./chatWebview.contract.js";
import type { ConversationClientPort } from "../../infrastructure/backend/ConversationClient.js";

const timestamp = "2026-07-18T12:00:00.000Z";
const sessionAId = "0d2e5770-f08e-48d5-871b-36bf734f535c";
const sessionBId = "7bc30c5f-4024-4d2f-a67d-8aa9e1570c92";
const sessionCId = "f9e2a3bc-83a2-4df8-91c3-2a0af66b7b17";

afterEach(() => {
  vi.useRealTimers();
});

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

class FakeConversationClient implements ConversationClientPort {
  private readonly snapshots = new Map<string, ConversationSessionSnapshot>();
  private sessions: ConversationSessionSummary[];

  public constructor() {
    this.sessions = [createSessionSummary(sessionAId, "Architecture"), createSessionSummary(sessionBId, "Debug notes")];
    this.snapshots.set(sessionAId, createConversationSnapshot(sessionAId, "Architecture", "Explain this service"));
    this.snapshots.set(sessionBId, createConversationSnapshot(sessionBId, "Debug notes", "Inspect this error"));
  }

  public createSession(): Promise<ConversationSession> {
    const session = createSessionSummary(sessionCId, "New chat");
    this.sessions = [session, ...this.sessions];
    this.snapshots.set(sessionCId, { ...session, messages: [] });
    return Promise.resolve(session);
  }

  public deleteSession(sessionId: string): Promise<void> {
    this.sessions = this.sessions.filter((session) => session.id !== sessionId);
    this.snapshots.delete(sessionId);
    return Promise.resolve();
  }

  public getSession(sessionId: string): Promise<ConversationSessionSnapshot> {
    const snapshot = this.snapshots.get(sessionId);
    if (snapshot === undefined) {
      throw new Error("Conversation not found.");
    }

    return Promise.resolve(structuredClone(snapshot));
  }

  public listSessions(): Promise<ConversationSessionSummary[]> {
    return Promise.resolve(structuredClone(this.sessions));
  }

  public renameSession(sessionId: string, title: string): Promise<ConversationSession> {
    const session = this.sessions.find((candidate) => candidate.id === sessionId);
    if (session === undefined) {
      throw new Error("Conversation not found.");
    }

    const renamed = { ...session, title };
    this.sessions = this.sessions.map((candidate) => (candidate.id === sessionId ? renamed : candidate));
    const snapshot = this.snapshots.get(sessionId);
    if (snapshot === undefined) {
      throw new Error("Conversation not found.");
    }
    this.snapshots.set(sessionId, { ...snapshot, title });
    return Promise.resolve(renamed);
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
  it("hydrates, switches, renames, creates, and deletes durable conversations", async () => {
    const controller = new ChatSessionController({
      conversationClient: new FakeConversationClient(),
      session: createSession(),
      transport: new FakeChatTransport(),
    });
    const events: string[] = [];
    controller.subscribe((event) => events.push(event.type));

    await controller.hydrate();

    expect(controller.getSnapshot()).toMatchObject({ sessionId: sessionAId });
    expect(controller.getSnapshot().messages[0]).toMatchObject({ content: "Explain this service" });
    expect(controller.getConversationSnapshot()).toMatchObject({ activeSessionId: sessionAId });

    await controller.selectConversation(sessionBId);
    await controller.renameConversation(sessionBId, "Resolved debug notes");
    await controller.createConversation();

    expect(controller.getSnapshot()).toMatchObject({ sessionId: sessionCId });
    expect(controller.getConversationSnapshot().sessions[0]).toMatchObject({
      id: sessionCId,
      title: "New chat",
    });

    await controller.deleteConversation(sessionCId);

    expect(controller.getSnapshot()).toMatchObject({ sessionId: sessionAId });
    expect(controller.getConversationSnapshot().sessions).toContainEqual(
      expect.objectContaining({ id: sessionBId, title: "Resolved debug notes" }),
    );
    expect(events).toContain("conversations:updated");
    expect(events).toContain("chat:hydrated");
  });

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
        content: "Explain this function",
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

  it("adds the currently registered project ID to each send", () => {
    const transport = new FakeChatTransport();
    const controller = new ChatSessionController({
      projectIdProvider: () => "2d2e5770-f08e-48d5-871b-36bf734f535c",
      session: createSession(),
      transport,
    });

    controller.connect();
    controller.submit("Explain this project");

    expect(transport.sent[0]).toMatchObject({
      content: "Explain this project",
      projectId: "2d2e5770-f08e-48d5-871b-36bf734f535c",
    });
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

    transport.setConnectionStatus("reconnecting");

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
    transport.setConnectionStatus("reconnecting");
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

  it("fails a silent generation after the client safety interval without replaying it", () => {
    vi.useFakeTimers();
    const transport = new FakeChatTransport();
    const controller = new ChatSessionController({
      session: createSession(),
      transport,
      watchdog: new GenerationWatchdog(1_000),
    });

    controller.connect();
    controller.submit("Explain this function");
    vi.advanceTimersByTime(1_000);

    expect(transport.sent).toHaveLength(1);
    expect(transport.cancelled).toEqual([{ requestId: "request-1", sessionId: "session-1" }]);
    expect(controller.getSnapshot()).toMatchObject({ activeGeneration: null });
    expect(controller.getSnapshot().messages[1]).toMatchObject({
      error: { code: "client_timeout", retryable: true },
      status: "failed",
    });
  });
});

function createSessionSummary(id: string, title: string): ConversationSessionSummary {
  return {
    createdAt: timestamp,
    id,
    messageCount: 1,
    title,
    updatedAt: timestamp,
  };
}

function createConversationSnapshot(id: string, title: string, content: string): ConversationSessionSnapshot {
  return {
    createdAt: timestamp,
    id,
    messages: [
      {
        content,
        createdAt: timestamp,
        id: "8396c93e-e5f1-4ff3-a311-7d5e4f2baeaa",
        ordinal: 1,
        requestId: "request-1",
        role: "user",
        sessionId: id,
        status: "completed",
        updatedAt: timestamp,
      },
    ],
    title,
    updatedAt: timestamp,
  };
}
