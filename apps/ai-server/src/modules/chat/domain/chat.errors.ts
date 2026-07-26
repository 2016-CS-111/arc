import type { ChatError, ChatErrorCode } from "@arc/contracts";

import { ChatModelError } from "../../inference/domain/chat-model.errors.js";

export function createChatError(code: ChatErrorCode, message: string, retryable: boolean): ChatError {
  return {
    code,
    message,
    retryable,
  };
}

export function toChatError(error: unknown): ChatError {
  if (!(error instanceof ChatModelError)) {
    return createChatError("generation_failed", "The local model could not complete the request.", true);
  }

  switch (error.code) {
    case "OLLAMA_NOT_CONFIGURED":
      return createChatError("provider_not_configured", "No local Ollama model is configured for Arc.", false);
    case "OLLAMA_UNREACHABLE":
      return createChatError("provider_unavailable", "Ollama is not reachable.", true);
    case "OLLAMA_MODEL_NOT_FOUND":
      return createChatError("model_missing", "The configured Ollama model is not installed.", false);
    case "OLLAMA_TIMEOUT":
      return createChatError("generation_timeout", "The model did not respond in time.", true);
    case "GENERATION_CANCELLED":
      return createChatError("generation_cancelled", "Generation was cancelled.", true);
    case "OLLAMA_PROTOCOL_ERROR":
    case "OLLAMA_REQUEST_FAILED":
      return createChatError("generation_failed", "The local model could not complete the request.", true);
  }
}
