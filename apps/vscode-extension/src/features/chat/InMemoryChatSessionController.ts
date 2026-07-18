import { randomUUID } from "node:crypto";

import type {
  ChatClientError,
  ChatConnectionStatus,
  ChatSessionMessage,
  ChatSessionSnapshot,
} from "./chatWebview.contract.js";

export interface ChatSessionControllerOptions {
  readonly createId?: () => string;
  readonly now?: () => string;
}

export interface ChatSubmission {
  readonly content: string;
  readonly requestId: string;
  readonly session: ChatSessionSnapshot;
}

export class InMemoryChatSessionController {
  private readonly createId: () => string;
  private readonly now: () => string;
  private session: ChatSessionSnapshot;

  public constructor(options: ChatSessionControllerOptions = {}) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.session = {
      activeGeneration: null,
      connectionStatus: "idle",
      messages: [],
      sessionId: this.createId(),
    };
  }

  public getSnapshot(): ChatSessionSnapshot {
    return structuredClone(this.session);
  }

  public submit(content: string): ChatSubmission | undefined {
    const normalizedContent = content.trim();
    if (
      normalizedContent.length === 0 ||
      normalizedContent.length > 20_000 ||
      this.session.messages.length > 78 ||
      this.session.activeGeneration !== null
    ) {
      return undefined;
    }

    const timestamp = this.now();
    const requestId = this.createId();
    const assistantMessageId = this.createId();
    const userMessage: ChatSessionMessage = {
      content: normalizedContent,
      createdAt: timestamp,
      id: this.createId(),
      role: "user",
      status: "completed",
    };
    const assistantMessage: ChatSessionMessage = {
      content: "",
      createdAt: timestamp,
      id: assistantMessageId,
      role: "assistant",
      status: "pending",
    };

    this.session = {
      ...this.session,
      activeGeneration: { assistantMessageId, requestId },
      messages: [...this.session.messages, userMessage, assistantMessage],
    };

    return {
      content: normalizedContent,
      requestId,
      session: this.getSnapshot(),
    };
  }

  public startGeneration(requestId: string): ChatSessionSnapshot | undefined {
    return this.updateActiveAssistant(requestId, ["pending"], (message) => ({
      ...message,
      status: "streaming",
    }));
  }

  public appendDelta(requestId: string, content: string): ChatSessionSnapshot | undefined {
    if (content.length === 0) {
      return undefined;
    }

    return this.updateActiveAssistant(requestId, ["streaming"], (message) => ({
      ...message,
      content: `${message.content}${content}`,
    }));
  }

  public complete(requestId: string): ChatSessionSnapshot | undefined {
    return this.completeActiveGeneration(requestId, (message) => ({
      ...message,
      status: "completed",
    }));
  }

  public cancel(requestId: string): ChatSessionSnapshot | undefined {
    return this.completeActiveGeneration(requestId, (message) => ({
      ...message,
      status: "cancelled",
    }));
  }

  public fail(requestId: string, error: ChatClientError): ChatSessionSnapshot | undefined {
    return this.completeActiveGeneration(requestId, (message) => ({
      ...message,
      error,
      status: "failed",
    }));
  }

  public updateConnectionStatus(status: ChatConnectionStatus): ChatSessionSnapshot {
    this.session = {
      ...this.session,
      connectionStatus: status,
    };
    return this.getSnapshot();
  }

  private updateActiveAssistant(
    requestId: string,
    acceptedStatuses: readonly ChatSessionMessage["status"][],
    update: (message: ChatSessionMessage) => ChatSessionMessage,
  ): ChatSessionSnapshot | undefined {
    const activeGeneration = this.session.activeGeneration;
    if (activeGeneration?.requestId !== requestId) {
      return undefined;
    }

    const assistantMessage = this.session.messages.find(
      (message) => message.id === activeGeneration.assistantMessageId,
    );
    if (assistantMessage === undefined || !acceptedStatuses.includes(assistantMessage.status)) {
      return undefined;
    }

    this.session = {
      ...this.session,
      messages: this.session.messages.map((message) =>
        message.id === assistantMessage.id ? update(message) : message,
      ),
    };
    return this.getSnapshot();
  }

  private completeActiveGeneration(
    requestId: string,
    update: (message: ChatSessionMessage) => ChatSessionMessage,
  ): ChatSessionSnapshot | undefined {
    const activeGeneration = this.session.activeGeneration;
    if (activeGeneration?.requestId !== requestId) {
      return undefined;
    }

    const assistantMessage = this.session.messages.find(
      (message) => message.id === activeGeneration.assistantMessageId,
    );
    if (
      assistantMessage === undefined ||
      (assistantMessage.status !== "pending" && assistantMessage.status !== "streaming")
    ) {
      return undefined;
    }

    this.session = {
      ...this.session,
      activeGeneration: null,
      messages: this.session.messages.map((message) =>
        message.id === assistantMessage.id ? update(message) : message,
      ),
    };
    return this.getSnapshot();
  }
}
