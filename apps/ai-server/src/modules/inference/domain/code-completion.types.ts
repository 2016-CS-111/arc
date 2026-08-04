export interface CodeCompletionModelRequest {
  readonly language: string;
  readonly maxTokens: number;
  readonly prefix: string;
  readonly suffix: string;
}

export interface CodeCompletionModelResponse {
  readonly completion: string;
  readonly latencyMs: number;
  readonly model: string;
}

export type CodeCompletionModelStatusCode =
  "ready" | "not_configured" | "unreachable" | "model_missing" | "unsupported" | "error";

export interface CodeCompletionModelStatus {
  readonly latencyMs: number | null;
  readonly message?: string;
  readonly model: string | null;
  readonly status: CodeCompletionModelStatusCode;
  readonly supportsFillInMiddle: boolean;
}
