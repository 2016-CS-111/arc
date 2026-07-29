export type EmbeddingModelErrorCode =
  | "EMBEDDING_NOT_CONFIGURED"
  | "EMBEDDING_MODEL_NOT_FOUND"
  | "EMBEDDING_UNREACHABLE"
  | "EMBEDDING_TIMEOUT"
  | "EMBEDDING_CANCELLED"
  | "EMBEDDING_REQUEST_FAILED"
  | "EMBEDDING_PROTOCOL_ERROR";

export class EmbeddingModelError extends Error {
  public constructor(
    public readonly code: EmbeddingModelErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EmbeddingModelError";
  }
}
