import type { ConversationSession, ConversationSessionSnapshot, ConversationSessionSummary } from "@arc/contracts";

import type { ConversationClientPort } from "../../infrastructure/backend/ConversationClient.js";
import { GenerationWatchdog } from "./GenerationWatchdog.js";
import { InMemoryChatSessionController } from "./InMemoryChatSessionController.js";
import type { ChatTransportEvent, ChatTransportPort, ChatTransportSubscription } from "./ChatTransportPort.js";
import type {
  ChatClientError,
  ChatConnectionStatus,
  ChatSessionMessage,
  ChatSessionSnapshot,
  ConversationListSnapshot,
  ExtensionToWebviewMessage,
} from "./chatWebview.contract.js";

export interface ChatSessionEventSubscription {
  dispose(): void;
}

export interface ChatSessionControllerOptions {
  readonly conversationClient?: ConversationClientPort;
  readonly projectIdProvider?: () => string | undefined;
  readonly session?: InMemoryChatSessionController;
  readonly transport: ChatTransportPort;
  readonly watchdog?: GenerationWatchdog;
}

export class ChatSessionController {
  private readonly listeners = new Set<(event: ExtensionToWebviewMessage) => void>();
  private readonly session: InMemoryChatSessionController;
  private readonly transportSubscription: ChatTransportSubscription;
  private readonly watchdog: GenerationWatchdog;
  private conversationOperation: Promise<void> | undefined;
  private sessions: ConversationSessionSummary[] = [];

  public constructor(private readonly options: ChatSessionControllerOptions) {
    this.session = options.session ?? new InMemoryChatSessionController();
    this.watchdog = options.watchdog ?? new GenerationWatchdog();
    this.transportSubscription = options.transport.subscribe((event) => {
      this.handleTransportEvent(event);
    });
  }

  public getSnapshot(): ChatSessionSnapshot {
    return this.session.getSnapshot();
  }

  public getConversationSnapshot(): ConversationListSnapshot {
    return {
      activeSessionId: this.options.conversationClient === undefined ? null : this.session.getSnapshot().sessionId,
      sessions: structuredClone(this.sessions),
    };
  }

  public connect(): void {
    try {
      this.options.transport.connect();
    } catch (error) {
      this.handleConnectionFailure(toConnectionError(error));
    }
  }

  public async hydrate(): Promise<void> {
    if (this.options.conversationClient === undefined) {
      this.publish({ session: this.session.getSnapshot(), type: "chat:hydrated" });
      return;
    }

    return this.runConversationOperation(async () => {
      const client = this.requireConversationClient();
      const sessions = await client.listSessions();
      const currentSessionId = this.session.getSnapshot().sessionId;
      const selectedSession = sessions.find((session) => session.id === currentSessionId) ?? sessions[0];

      if (selectedSession !== undefined) {
        this.replaceConversation(await client.getSession(selectedSession.id), sessions);
        return;
      }

      const createdSession = await client.createSession();
      this.replaceConversation(toEmptySessionSnapshot(createdSession), [toSessionSummary(createdSession)]);
    });
  }

  public async createConversation(): Promise<void> {
    if (!this.canChangeConversation()) {
      return;
    }

    return this.runConversationOperation(async () => {
      const client = this.requireConversationClient();
      const createdSession = await client.createSession();
      this.replaceConversation(toEmptySessionSnapshot(createdSession), [
        toSessionSummary(createdSession),
        ...this.sessions,
      ]);
    });
  }

  public async selectConversation(sessionId: string): Promise<void> {
    if (!this.canChangeConversation() || sessionId === this.session.getSnapshot().sessionId) {
      return;
    }

    return this.runConversationOperation(async () => {
      const session = await this.requireConversationClient().getSession(sessionId);
      this.replaceConversation(session, this.sessions);
    });
  }

  public async renameConversation(sessionId: string, title: string): Promise<void> {
    if (!this.canChangeConversation() || title.trim().length === 0) {
      return;
    }

    return this.runConversationOperation(async () => {
      const renamedSession = await this.requireConversationClient().renameSession(sessionId, title.trim());
      this.sessions = this.sessions.map((session) =>
        session.id === renamedSession.id ? { ...session, ...renamedSession } : session,
      );
      this.publishConversationSnapshot();
    });
  }

  public async deleteConversation(sessionId: string): Promise<void> {
    if (!this.canChangeConversation()) {
      return;
    }

    return this.runConversationOperation(async () => {
      const client = this.requireConversationClient();
      await client.deleteSession(sessionId);
      const remainingSessions = this.sessions.filter((session) => session.id !== sessionId);

      if (sessionId !== this.session.getSnapshot().sessionId) {
        this.sessions = remainingSessions;
        this.publishConversationSnapshot();
        return;
      }

      const nextSession = remainingSessions[0];
      if (nextSession !== undefined) {
        this.replaceConversation(await client.getSession(nextSession.id), remainingSessions);
        return;
      }

      const createdSession = await client.createSession();
      this.replaceConversation(toEmptySessionSnapshot(createdSession), [toSessionSummary(createdSession)]);
    });
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

    this.watchdog.arm(submission.requestId, () => {
      this.handleWatchdogTimeout(submission.requestId);
    });

    try {
      const projectId = this.options.projectIdProvider?.();
      this.options.transport.send({
        content: submission.content,
        ...(projectId === undefined ? {} : { projectId }),
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
    this.watchdog.dispose();
    this.transportSubscription.dispose();
    this.options.transport.dispose();
    this.listeners.clear();
  }

  private canChangeConversation(): boolean {
    return this.session.getSnapshot().activeGeneration === null;
  }

  private requireConversationClient(): ConversationClientPort {
    if (this.options.conversationClient === undefined) {
      throw new Error("Arc durable conversation storage is unavailable.");
    }

    return this.options.conversationClient;
  }

  private runConversationOperation(operation: () => Promise<void>): Promise<void> {
    if (this.conversationOperation !== undefined) {
      return this.conversationOperation;
    }

    const pendingOperation = this.runConversationOperationSafely(operation);
    this.conversationOperation = pendingOperation;
    void pendingOperation.finally(() => {
      if (this.conversationOperation === pendingOperation) {
        this.conversationOperation = undefined;
      }
    });
    return pendingOperation;
  }

  private async runConversationOperationSafely(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.publish({
        message: error instanceof Error ? error.message : "Arc conversations could not be updated.",
        type: "conversations:error",
      });
      this.publish({ session: this.session.getSnapshot(), type: "chat:hydrated" });
    }
  }

  private replaceConversation(snapshot: ConversationSessionSnapshot, sessions: ConversationSessionSummary[]): void {
    const messages = snapshot.messages.slice(-198).map(toChatSessionMessage);
    const activeMessage = [...snapshot.messages]
      .reverse()
      .find((message) => message.role === "assistant" && isGenerating(message.status));
    const session = this.session.hydrate({
      activeGeneration:
        activeMessage === undefined
          ? null
          : {
              assistantMessageId: activeMessage.id,
              requestId: activeMessage.requestId,
            },
      messages,
      sessionId: snapshot.id,
    });

    this.watchdog.clear();
    if (activeMessage !== undefined) {
      this.watchdog.arm(activeMessage.requestId, () => {
        this.handleWatchdogTimeout(activeMessage.requestId);
      });
    }

    this.sessions = sessions;
    this.publishConversationSnapshot();
    this.publish({ session, type: "chat:hydrated" });
  }

  private publishConversationSnapshot(): void {
    this.publish({ snapshot: this.getConversationSnapshot(), type: "conversations:updated" });
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
          this.watchdog.touch(event.payload.requestId);
          this.publish({ requestId: event.payload.requestId, type: "chat:generation-started" });
        }
        return;
      case "delta":
        if (this.session.appendDelta(event.payload.requestId, event.payload.content) !== undefined) {
          this.watchdog.touch(event.payload.requestId);
          this.publish({
            content: event.payload.content,
            requestId: event.payload.requestId,
            type: "chat:generation-delta",
          });
        }
        return;
      case "completed":
        if (this.session.complete(event.payload.requestId) !== undefined) {
          this.watchdog.clear(event.payload.requestId);
          this.publish({ requestId: event.payload.requestId, type: "chat:generation-completed" });
        }
        return;
      case "cancelled":
        if (this.session.cancel(event.payload.requestId) !== undefined) {
          this.watchdog.clear(event.payload.requestId);
          this.publish({ requestId: event.payload.requestId, type: "chat:generation-cancelled" });
        }
        return;
      case "error":
        this.failActiveGeneration(event.payload.requestId, event.payload.error);
        return;
      case "edit-proposal":
        this.publish({ proposal: event.payload.proposal, type: "edits:proposed" });
        return;
      case "malformed-event":
        return;
    }
  }

  private handleConnectionStatus(status: ChatConnectionStatus): void {
    this.session.updateConnectionStatus(status);
    this.publish({ status, type: "chat:connection-updated" });

    if (status === "reconnecting" || status === "offline") {
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
      this.watchdog.clear(requestId);
      this.publish({ error, requestId, type: "chat:generation-failed" });
    }
  }

  private handleWatchdogTimeout(requestId: string): void {
    if (this.options.transport.connectionStatus === "connected") {
      try {
        this.options.transport.cancel({
          requestId,
          sessionId: this.session.getSnapshot().sessionId,
        });
      } catch {
        // The local failure below remains authoritative if cancellation cannot be delivered.
      }
    }

    this.failActiveGeneration(requestId, {
      code: "client_timeout",
      message: "Arc stopped waiting because no model activity was received.",
      retryable: true,
    });
  }

  private publish(event: ExtensionToWebviewMessage): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function toEmptySessionSnapshot(session: ConversationSession): ConversationSessionSnapshot {
  return { ...session, messages: [] };
}

function toSessionSummary(session: ConversationSession): ConversationSessionSummary {
  return { ...session, messageCount: 0 };
}

function toChatSessionMessage(message: ConversationSessionSnapshot["messages"][number]): ChatSessionMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    ...(message.error === undefined ? {} : { error: message.error }),
    id: message.id,
    role: message.role,
    status: message.status,
  };
}

function isGenerating(status: ChatSessionMessage["status"]): boolean {
  return status === "pending" || status === "streaming";
}

function toConnectionError(error: unknown): ChatClientError {
  return {
    code: "connection_unavailable",
    message: error instanceof Error ? error.message : "Connection to the Arc backend was lost.",
    retryable: true,
  };
}
