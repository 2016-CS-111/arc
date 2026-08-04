import type { ChatModelEvent, ChatModelRequest, ChatModelStatus } from "../domain/chat-model.types.js";

export interface ChatModelPort {
  getStatus(signal?: AbortSignal): Promise<ChatModelStatus>;
  streamChat(request: ChatModelRequest, signal?: AbortSignal): AsyncIterable<ChatModelEvent>;
}
