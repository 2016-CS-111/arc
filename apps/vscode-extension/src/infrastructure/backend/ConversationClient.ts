import {
  ConversationSessionSchema,
  ConversationSessionSnapshotSchema,
  ConversationSessionSummarySchema,
  type ConversationSession,
  type ConversationSessionSnapshot,
  type ConversationSessionSummary,
} from "@arc/contracts";

export interface ConversationClientPort {
  createSession(title?: string): Promise<ConversationSession>;
  deleteSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<ConversationSessionSnapshot>;
  listSessions(): Promise<ConversationSessionSummary[]>;
  renameSession(sessionId: string, title: string): Promise<ConversationSession>;
}

export class ConversationClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConversationClientError";
  }
}

export class ConversationClient implements ConversationClientPort {
  public constructor(
    private readonly backendUrl: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  public async createSession(title?: string): Promise<ConversationSession> {
    const payload = title === undefined ? {} : { title };
    return ConversationSessionSchema.parse(
      await this.requestJson("conversations", {
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
  }

  public async listSessions(): Promise<ConversationSessionSummary[]> {
    return ConversationSessionSummarySchema.array().parse(await this.requestJson("conversations"));
  }

  public async getSession(sessionId: string): Promise<ConversationSessionSnapshot> {
    return ConversationSessionSnapshotSchema.parse(await this.requestJson(`conversations/${sessionId}`));
  }

  public async renameSession(sessionId: string, title: string): Promise<ConversationSession> {
    return ConversationSessionSchema.parse(
      await this.requestJson(`conversations/${sessionId}`, {
        body: JSON.stringify({ title }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    );
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const response = await this.request(`conversations/${sessionId}`, { method: "DELETE" });
    if (response.status !== 204) {
      throw new ConversationClientError(`Arc backend returned HTTP ${String(response.status)}.`);
    }
  }

  private async requestJson(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await this.request(path, options);

    try {
      return await response.json();
    } catch {
      throw new ConversationClientError("Arc backend returned an invalid conversation response.");
    }
  }

  private async request(path: string, options: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.urlFor(path), options);
    } catch {
      throw new ConversationClientError("Arc backend is unavailable.");
    }

    if (!response.ok) {
      throw new ConversationClientError(`Arc backend returned HTTP ${String(response.status)}.`);
    }

    return response;
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.backendUrl.replace(/\/$/, "")}/`).toString();
  }
}
