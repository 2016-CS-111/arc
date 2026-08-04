export type EmbeddingPurpose = "document" | "query";

export interface EmbeddingModelRequest {
  readonly purpose: EmbeddingPurpose;
  readonly inputs: readonly string[];
}

export interface EmbeddingModelResult {
  readonly provider: "ollama";
  readonly model: string;
  readonly dimensions: number;
  readonly inputFormat: "plain-v1";
  readonly vectors: readonly (readonly number[])[];
}

export type EmbeddingModelStatusCode = "ready" | "not_configured" | "unreachable" | "model_missing" | "error";

export interface EmbeddingModelStatus {
  readonly status: EmbeddingModelStatusCode;
  readonly model: string | null;
  readonly dimensions: number | null;
  readonly latencyMs: number | null;
  readonly message?: string;
}
