export type ChatModelErrorCode =
  | "OLLAMA_NOT_CONFIGURED"
  | "OLLAMA_UNREACHABLE"
  | "OLLAMA_MODEL_NOT_FOUND"
  | "OLLAMA_TIMEOUT"
  | "OLLAMA_PROTOCOL_ERROR"
  | "OLLAMA_REQUEST_FAILED"
  | "GENERATION_CANCELLED";

export class ChatModelError extends Error {
  public constructor(
    public readonly code: ChatModelErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ChatModelError";
  }
}
