import type { ChatSendCommand } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import { CHAT_MODEL } from "../../inference/inference.constants.js";
import type { ChatModelEvent } from "../../inference/domain/chat-model.types.js";

@Injectable()
export class SendChatMessageService {
  public constructor(@Inject(CHAT_MODEL) private readonly chatModel: ChatModelPort) {}

  public stream(command: ChatSendCommand, signal: AbortSignal): AsyncIterable<ChatModelEvent> {
    return this.chatModel.streamChat(
      {
        messages: command.messages,
      },
      signal,
    );
  }
}
