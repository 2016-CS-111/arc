import type { ChatSendCommand } from "@arc/contracts";
import { describe, expect, it } from "vitest";

import { SocketIoChatTransport, type SocketClient } from "./SocketIoChatTransport.js";

class FakeSocketClient implements SocketClient {
  public connected = false;
  public readonly emitted: { eventName: string; payload: unknown }[] = [];
  private readonly listeners = new Map<string, ((payload: unknown) => void)[]>();

  public connect(): void {
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

  public removeAllListeners(): void {
    this.listeners.clear();
  }

  public emitFromServer(eventName: string, payload: unknown): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
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
      messages: [{ content: "Explain this function", role: "user" }],
      requestId: "request-1",
      sessionId: "session-1",
    };

    transport.connect();
    socket.emitFromServer("connect", undefined);
    transport.send(command);
    transport.cancel({ requestId: "request-1", sessionId: "session-1" });

    expect(socket.emitted).toEqual([
      { eventName: "chat:send", payload: command },
      {
        eventName: "chat:cancel",
        payload: { requestId: "request-1", sessionId: "session-1" },
      },
    ]);
  });
});
