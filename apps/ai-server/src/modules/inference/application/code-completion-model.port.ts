import type {
  CodeCompletionModelRequest,
  CodeCompletionModelResponse,
  CodeCompletionModelStatus,
} from "../domain/code-completion.types.js";

export interface CodeCompletionModelPort {
  complete(request: CodeCompletionModelRequest, signal?: AbortSignal): Promise<CodeCompletionModelResponse>;
  getStatus(signal?: AbortSignal): Promise<CodeCompletionModelStatus>;
}
