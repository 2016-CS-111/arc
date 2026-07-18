import { InMemoryChatSessionController } from "./InMemoryChatSessionController.js";
import type { ChatTransportEvent, ChatTransportPort, ChatTransportSubscription } from "./ChatTransportPort.js";
import type {
  ChatClientError,
  ChatConnectionStatus,
  ChatSessionSnapshot,
  ExtensionToWebviewMessage,
} from "./chatWebview.contract.js";

export interface ChatSessionEventSubscription {
  dispose(): void;
}

export interface ChatSessionControllerOptions {
  readonly session?: InMemoryChatSessionController;
  readonly transport: ChatTransportPort;
}

export class ChatSessionController {
  private readonly listeners = new Set<(event: ExtensionToWebviewMessage) => void>();
  private readonly session: InMemoryChatSessionController;
  private readonly transportSubscription: ChatTransportSubscription;

  public constructor(private readonly options: ChatSessionControllerOptions) {
    this.session = options.session ?? new InMemoryChatSessionController();
    this.transportSubscription = options.transport.subscribe((event) => {
      this.handleTransportEvent(event);
    });
  }

  public getSnapshot(): ChatSessionSnapshot {
    return this.session.getSnapshot();
  }

  public connect(): void {
    try {
      this.options.transport.connect();
    } catch (error) {
      this.handleConnectionFailure(toConnectionError(error));
    }
  }

  public submit(content: string): void {
    const submission = this.session.submit(content);
    if (submission === undefined) {
      return;
    }

    this.publish({ session: submission.session, type: "chat:submitted" });

    if (this.options.transport.connectionStatus !== "connected") {
      this.failActiveGeneration(submission.requestId, {
        code: "connection_unavailable",
        message: "Connect to the Arc backend before sending a message.",
        retryable: true,
      });
      return;
    }

    try {
      this.options.transport.send({
        content: submission.content,
        requestId: submission.requestId,
        sessionId: submission.session.sessionId,
      });
    } catch (error) {
      this.failActiveGeneration(submission.requestId, toConnectionError(error));
    }
  }

  public cancelActiveGeneration(): void {
    const activeGeneration = this.session.getSnapshot().activeGeneration;
    if (activeGeneration === null) {
      return;
    }

    if (this.options.transport.connectionStatus !== "connected") {
      this.failActiveGeneration(activeGeneration.requestId, toConnectionError(undefined));
      return;
    }

    try {
      this.options.transport.cancel({
        requestId: activeGeneration.requestId,
        sessionId: this.session.getSnapshot().sessionId,
      });
    } catch (error) {
      this.failActiveGeneration(activeGeneration.requestId, toConnectionError(error));
    }
  }

  public subscribe(listener: (event: ExtensionToWebviewMessage) => void): ChatSessionEventSubscription {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  public dispose(): void {
    this.transportSubscription.dispose();
    this.options.transport.dispose();
    this.listeners.clear();
  }

  private handleTransportEvent(event: ChatTransportEvent): void {
    switch (event.type) {
      case "connection-status":
        this.handleConnectionStatus(event.status);
        return;
      case "connection-error":
        this.handleConnectionFailure({
          code: "connection_unavailable",
          message: event.message,
          retryable: true,
        });
        return;
      case "accepted":
        if (this.session.startGeneration(event.payload.requestId) !== undefined) {
          this.publish({ requestId: event.payload.requestId, type: "chat:generation-started" });
        }
        return;
      case "delta":
        if (this.session.appendDelta(event.payload.requestId, event.payload.content) !== undefined) {
          this.publish({
            content: event.payload.content,
            requestId: event.payload.requestId,
            type: "chat:generation-delta",
          });
        }
        return;
      case "completed":
        if (this.session.complete(event.payload.requestId) !== undefined) {
          this.publish({ requestId: event.payload.requestId, type: "chat:generation-completed" });
        }
        return;
      case "cancelled":
        if (this.session.cancel(event.payload.requestId) !== undefined) {
          this.publish({ requestId: event.payload.requestId, type: "chat:generation-cancelled" });
        }
        return;
      case "error":
        this.failActiveGeneration(event.payload.requestId, event.payload.error);
        return;
      case "malformed-event":
        return;
    }
  }

  private handleConnectionStatus(status: ChatConnectionStatus): void {
    this.session.updateConnectionStatus(status);
    this.publish({ status, type: "chat:connection-updated" });

    if (status === "disconnected") {
      this.handleConnectionFailure(toConnectionError(undefined));
    }
  }

  private handleConnectionFailure(error: ChatClientError): void {
    const activeGeneration = this.session.getSnapshot().activeGeneration;
    if (activeGeneration !== null) {
      this.failActiveGeneration(activeGeneration.requestId, error);
    }
  }

  private failActiveGeneration(requestId: string, error: ChatClientError): void {
    if (this.session.fail(requestId, error) !== undefined) {
      this.publish({ error, requestId, type: "chat:generation-failed" });
    }
  }

  private publish(event: ExtensionToWebviewMessage): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function toConnectionError(error: unknown): ChatClientError {
  return {
    code: "connection_unavailable",
    message: error instanceof Error ? error.message : "Connection to the Arc backend was lost.",
    retryable: true,
  };
}
