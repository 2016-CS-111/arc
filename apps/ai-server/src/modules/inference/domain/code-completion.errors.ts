export type CodeCompletionErrorCode =
  | "OLLAMA_NOT_CONFIGURED"
  | "OLLAMA_UNREACHABLE"
  | "OLLAMA_MODEL_NOT_FOUND"
  | "OLLAMA_TIMEOUT"
  | "OLLAMA_PROTOCOL_ERROR"
  | "OLLAMA_REQUEST_FAILED"
  | "COMPLETION_CANCELLED";

export class CodeCompletionError extends Error {
  public constructor(
    public readonly code: CodeCompletionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CodeCompletionError";
  }
}
