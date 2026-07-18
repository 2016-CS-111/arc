import {
  ChatAcceptedEventSchema,
  ChatCancelledEventSchema,
  ChatCompletedEventSchema,
  ChatDeltaEventSchema,
  ChatErrorEventSchema,
  type ChatCancelCommand,
  type ChatSendCommand,
} from "@arc/contracts";
import { io } from "socket.io-client";

import type {
  ChatTransportEvent,
  ChatTransportPort,
  ChatTransportSubscription,
} from "../../features/chat/ChatTransportPort.js";
import type { ChatConnectionStatus } from "../../features/chat/chatWebview.contract.js";

export interface SocketClient {
  readonly connected: boolean;

  connect(): void;
  disconnect(): void;
  emit(eventName: string, payload: unknown): void;
  on(eventName: string, listener: (payload: unknown) => void): void;
  removeAllListeners(): void;
}

export type SocketClientFactory = (url: string) => SocketClient;

export class SocketIoChatTransport implements ChatTransportPort {
  private connectionState: ChatConnectionStatus = "idle";
  private readonly listeners = new Set<(event: ChatTransportEvent) => void>();
  private socket: SocketClient | undefined;

  public constructor(
    private readonly backendUrl: string,
    private readonly createSocket: SocketClientFactory = createSocketClient,
  ) {}

  public get connectionStatus(): ChatConnectionStatus {
    return this.connectionState;
  }

  public connect(): void {
    if (this.connectionState === "connected" || this.connectionState === "connecting") {
      return;
    }

    this.updateConnectionStatus("connecting");
    this.getSocket().connect();
  }

  public send(command: ChatSendCommand): void {
    const socket = this.socket;
    if (!socket?.connected) {
      throw new Error("Arc chat transport is not connected.");
    }

    socket.emit("chat:send", command);
  }

  public cancel(command: ChatCancelCommand): void {
    const socket = this.socket;
    if (!socket?.connected) {
      throw new Error("Arc chat transport is not connected.");
    }

    socket.emit("chat:cancel", command);
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
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = undefined;
    this.listeners.clear();
    this.connectionState = "idle";
  }

  private getSocket(): SocketClient {
    if (this.socket !== undefined) {
      return this.socket;
    }

    const socket = this.createSocket(new URL("/chat", this.backendUrl).toString());

    socket.on("connect", () => {
      this.updateConnectionStatus("connected");
    });
    socket.on("disconnect", () => {
      this.updateConnectionStatus("disconnected");
    });
    socket.on("connect_error", (error) => {
      this.updateConnectionStatus("disconnected");
      this.emit({
        message: error instanceof Error ? error.message : "Unable to connect to the Arc backend.",
        type: "connection-error",
      });
    });
    socket.on("chat:accepted", (payload: unknown) => {
      const parsed = ChatAcceptedEventSchema.safeParse(payload);
      if (parsed.success) {
        this.emit({ payload: parsed.data, type: "accepted" });
      } else {
        this.emit({ eventName: "chat:accepted", type: "malformed-event" });
      }
    });
    socket.on("chat:delta", (payload: unknown) => {
      const parsed = ChatDeltaEventSchema.safeParse(payload);
      if (parsed.success) {
        this.emit({ payload: parsed.data, type: "delta" });
      } else {
        this.emit({ eventName: "chat:delta", type: "malformed-event" });
      }
    });
    socket.on("chat:completed", (payload: unknown) => {
      const parsed = ChatCompletedEventSchema.safeParse(payload);
      if (parsed.success) {
        this.emit({ payload: parsed.data, type: "completed" });
      } else {
        this.emit({ eventName: "chat:completed", type: "malformed-event" });
      }
    });
    socket.on("chat:cancelled", (payload: unknown) => {
      const parsed = ChatCancelledEventSchema.safeParse(payload);
      if (parsed.success) {
        this.emit({ payload: parsed.data, type: "cancelled" });
      } else {
        this.emit({ eventName: "chat:cancelled", type: "malformed-event" });
      }
    });
    socket.on("chat:error", (payload: unknown) => {
      const parsed = ChatErrorEventSchema.safeParse(payload);
      if (parsed.success) {
        this.emit({ payload: parsed.data, type: "error" });
      } else {
        this.emit({ eventName: "chat:error", type: "malformed-event" });
      }
    });

    this.socket = socket;
    return socket;
  }

  private updateConnectionStatus(status: ChatConnectionStatus): void {
    if (this.connectionState === status) {
      return;
    }

    this.connectionState = status;
    this.emit({ status, type: "connection-status" });
  }

  private emit(event: ChatTransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function createSocketClient(url: string): SocketClient {
  return io(url, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2_000,
    transports: ["websocket"],
  });
}
