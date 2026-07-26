export type ChatModelRole = "system" | "user" | "assistant";

export interface ChatModelMessage {
  readonly role: ChatModelRole;
  readonly content: string;
}

export interface ChatModelRequest {
  readonly messages: readonly ChatModelMessage[];
}

export interface ChatModelUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalDurationMs?: number;
}

export type ChatModelEvent =
  | {
      readonly type: "delta";
      readonly content: string;
    }
  | {
      readonly type: "completed";
      readonly finishReason?: string;
      readonly usage?: ChatModelUsage;
    };

export type ChatModelStatusCode = "ready" | "not_configured" | "unreachable" | "model_missing" | "error";

export interface ChatModelStatus {
  readonly status: ChatModelStatusCode;
  readonly model: string | null;
  readonly latencyMs: number | null;
  readonly message?: string;
}
