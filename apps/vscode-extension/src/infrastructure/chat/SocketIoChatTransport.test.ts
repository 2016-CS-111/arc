import type { ChatSendCommand } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { SocketIoChatTransport, type SocketClient, type SocketManagerEventName } from "./SocketIoChatTransport.js";

class FakeSocketClient implements SocketClient {
  public connected = false;
  public connectCalls = 0;
  public readonly emitted: { eventName: string; payload: unknown }[] = [];
  private readonly listeners = new Map<string, ((payload: unknown) => void)[]>();
  private readonly managerListeners = new Map<SocketManagerEventName, ((...payload: unknown[]) => void)[]>();

  public connect(): void {
    this.connectCalls += 1;
    this.connected = true;
  }

  public disconnect(): void {
    this.connected = false;
  }

  public emit(eventName: string, payload: unknown): void {
    this.emitted.push({ eventName, payload });
  }

  public on(eventName: string, listener: (payload: unknown) => void): void {
    const eventListeners = this.listeners.get(eventName) ?? [];
    eventListeners.push(listener);
    this.listeners.set(eventName, eventListeners);
  }

  public onManager(eventName: SocketManagerEventName, listener: (...payload: unknown[]) => void): void {
    const eventListeners = this.managerListeners.get(eventName) ?? [];
    eventListeners.push(listener);
    this.managerListeners.set(eventName, eventListeners);
  }

  public offManager(eventName: SocketManagerEventName, listener: (...payload: unknown[]) => void): void {
    const eventListeners = this.managerListeners.get(eventName) ?? [];
    this.managerListeners.set(
      eventName,
      eventListeners.filter((candidate) => candidate !== listener),
    );
  }

  public removeAllListeners(): void {
    this.listeners.clear();
  }

  public emitFromServer(eventName: string, payload: unknown): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(payload);
    }
  }

  public emitFromManager(eventName: SocketManagerEventName, payload: unknown): void {
    for (const listener of this.managerListeners.get(eventName) ?? []) {
      listener(payload);
    }
  }
}

describe("SocketIoChatTransport", () => {
  it("maps validated Socket.IO events and rejects malformed payloads", () => {
    const socket = new FakeSocketClient();
    const urls: string[] = [];
    const transport = new SocketIoChatTransport("http://127.0.0.1:7331", (url) => {
      urls.push(url);
      return socket;
    });
    const events: string[] = [];
    transport.subscribe((event) => {
      events.push(event.type);
    });

    transport.connect();
    socket.emitFromServer("connect", undefined);
    socket.emitFromServer("chat:accepted", {
      requestId: "request-1",
      sessionId: "session-1",
    });
    socket.emitFromServer("chat:delta", { content: "hello" });

    expect(urls).toEqual(["http://127.0.0.1:7331/chat"]);
    expect(events).toEqual(["connection-status", "connection-status", "accepted", "malformed-event"]);
  });

  it("emits correlated send and cancellation commands only while connected", () => {
    const socket = new FakeSocketClient();
    const transport = new SocketIoChatTransport("http://127.0.0.1:7331", () => socket);
    const command: ChatSendCommand = {
      content: "Explain this function",
      requestId: "request-1",
      sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
    };

    transport.connect();
    socket.emitFromServer("connect", undefined);
    transport.send(command);
    transport.cancel({ requestId: "request-1", sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c" });

    expect(socket.emitted).toEqual([
      { eventName: "chat:send", payload: command },
      {
        eventName: "chat:cancel",
        payload: { requestId: "request-1", sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c" },
      },
    ]);
  });

  it("relays a staged memory suggestion", () => {
    const socket = new FakeSocketClient();
    const transport = new SocketIoChatTransport("http://127.0.0.1:7331", () => socket);
    const events: unknown[] = [];
    transport.subscribe((event) => {
      events.push(event);
    });

    transport.connect();
    socket.emitFromServer("chat:memory-proposal", {
      proposal: {
        candidate: { content: "Use Sequelize.", kind: "convention", scope: "project" },
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000001",
        memoryId: null,
        requestId: "request-1",
        sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
        status: "pending",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(events.at(-1)).toMatchObject({ type: "memory-proposal" });
  });

  it("exposes bounded reconnect lifecycle states and supports an explicit retry", () => {
    const socket = new FakeSocketClient();
    const transport = new SocketIoChatTransport("http://127.0.0.1:7331", () => socket);
    const events: string[] = [];
    transport.subscribe((event) => {
      if (event.type === "connection-status") {
        events.push(event.status);
      } else if (event.type === "connection-error") {
        events.push(event.type);
      }
    });

    transport.connect();
    socket.emitFromServer("connect_error", new Error("ECONNREFUSED"));
    socket.emitFromManager("reconnect_attempt", 1);
    socket.emitFromManager("reconnect_failed", undefined);
    transport.connect();
    socket.emitFromServer("connect", undefined);

    expect(socket.connectCalls).toBe(2);
    expect(events).toEqual(["connecting", "reconnecting", "offline", "connection-error", "connecting", "connected"]);
  });
});
