import type { ChatClientError } from "../../src/features/chat/chatWebview.contract.js";

const errorMessages: Readonly<Record<string, string>> = {
  client_timeout: "Arc stopped waiting because no model activity was received.",
  connection_unavailable: "Connection to Arc was lost. Reconnect before sending a new prompt.",
  context_window_exceeded: "This prompt is too large for the configured local model context window.",
  generation_cancelled: "Generation was cancelled.",
  generation_failed: "The local model could not complete the request.",
  generation_not_found: "That generation is no longer active.",
  generation_timeout: "The local model did not respond before the configured timeout.",
  invalid_request: "Arc could not process this prompt because the request was invalid.",
  model_missing: "The configured Ollama model is not installed.",
  provider_not_configured: "No local Ollama model is configured for Arc.",
  provider_unavailable: "Ollama is unavailable. Check that it is running, then try again.",
  session_busy: "This conversation is already generating a response.",
};

export class ChatErrorPresenter {
  public getMessage(error: ChatClientError): string {
    return errorMessages[error.code] ?? "Arc could not complete the response.";
  }
}
