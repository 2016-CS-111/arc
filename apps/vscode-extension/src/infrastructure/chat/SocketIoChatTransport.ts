import {
  ChatAcceptedEventSchema,
  ChatCancelledEventSchema,
  ChatCompletedEventSchema,
  ChatDeltaEventSchema,
  ChatEditProposalEventSchema,
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

export type SocketManagerEventName = "reconnect_attempt" | "reconnect_failed";

export interface SocketClient {
  readonly connected: boolean;

  connect(): void;
  disconnect(): void;
  emit(eventName: string, payload: unknown): void;
  offManager(eventName: SocketManagerEventName, listener: (...payload: unknown[]) => void): void;
  on(eventName: string, listener: (payload: unknown) => void): void;
  onManager(eventName: SocketManagerEventName, listener: (...payload: unknown[]) => void): void;
  removeAllListeners(): void;
}

export type SocketClientFactory = (url: string) => SocketClient;

export class SocketIoChatTransport implements ChatTransportPort {
  private connectionState: ChatConnectionStatus = "idle";
  private readonly listeners = new Set<(event: ChatTransportEvent) => void>();
  private readonly onReconnectAttempt = (): void => {
    this.updateConnectionStatus("reconnecting");
  };
  private readonly onReconnectFailed = (): void => {
    this.updateConnectionStatus("offline");
    this.emit({
      message: "Arc could not reconnect to the backend.",
      type: "connection-error",
    });
  };
  private socket: SocketClient | undefined;

  public constructor(
    private readonly backendUrl: string,
    private readonly createSocket: SocketClientFactory = createSocketClient,
  ) {}

  public get connectionStatus(): ChatConnectionStatus {
    return this.connectionState;
  }

  public connect(): void {
    if (
      this.connectionState === "connected" ||
      this.connectionState === "connecting" ||
      this.connectionState === "reconnecting"
    ) {
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
    this.socket?.offManager("reconnect_attempt", this.onReconnectAttempt);
    this.socket?.offManager("reconnect_failed", this.onReconnectFailed);
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
    socket.on("disconnect", (reason) => {
      const reconnectsAutomatically = reason !== "io server disconnect" && reason !== "io client disconnect";
      this.updateConnectionStatus(reconnectsAutomatically ? "reconnecting" : "offline");
    });
    socket.on("connect_error", () => {
      this.updateConnectionStatus("reconnecting");
    });
    socket.onManager("reconnect_attempt", this.onReconnectAttempt);
    socket.onManager("reconnect_failed", this.onReconnectFailed);
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
    socket.on("chat:edit-proposal", (payload: unknown) => {
      const parsed = ChatEditProposalEventSchema.safeParse(payload);
      if (parsed.success) {
        this.emit({ payload: parsed.data, type: "edit-proposal" });
      } else {
        this.emit({ eventName: "chat:edit-proposal", type: "malformed-event" });
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
  return new SocketIoClientAdapter(
    io(url, {
      autoConnect: false,
      randomizationFactor: 0,
      reconnection: true,
      reconnectionAttempts: 4,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      timeout: 10_000,
      transports: ["websocket"],
    }),
  );
}

class SocketIoClientAdapter implements SocketClient {
  public constructor(private readonly socket: ReturnType<typeof io>) {}

  public get connected(): boolean {
    return this.socket.connected;
  }

  public connect(): void {
    this.socket.connect();
  }

  public disconnect(): void {
    this.socket.disconnect();
  }

  public emit(eventName: string, payload: unknown): void {
    this.socket.emit(eventName, payload);
  }

  public offManager(eventName: SocketManagerEventName, listener: (...payload: unknown[]) => void): void {
    this.socket.io.off(eventName, listener);
  }

  public on(eventName: string, listener: (payload: unknown) => void): void {
    this.socket.on(eventName, listener);
  }

  public onManager(eventName: SocketManagerEventName, listener: (...payload: unknown[]) => void): void {
    this.socket.io.on(eventName, listener);
  }

  public removeAllListeners(): void {
    this.socket.removeAllListeners();
  }
}
