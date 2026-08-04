export type ChatModelRole = "system" | "user" | "assistant" | "tool";

export interface ChatModelToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface ChatModelToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface ChatModelMessage {
  readonly role: ChatModelRole;
  readonly content: string;
  readonly toolName?: string;
  readonly toolCalls?: readonly ChatModelToolCall[];
}

export interface ChatModelRequest {
  readonly messages: readonly ChatModelMessage[];
  readonly tools?: readonly ChatModelToolDefinition[];
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
      readonly type: "tool_calls";
      readonly calls: readonly ChatModelToolCall[];
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
