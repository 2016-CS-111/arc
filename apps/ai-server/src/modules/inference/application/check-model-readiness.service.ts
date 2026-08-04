import { Inject, Injectable } from "@nestjs/common";

import { CHAT_MODEL } from "../inference.constants.js";
import type { ChatModelStatus } from "../domain/chat-model.types.js";
import type { ChatModelPort } from "./chat-model.port.js";

@Injectable()
export class CheckModelReadinessService {
  public constructor(@Inject(CHAT_MODEL) private readonly chatModel: ChatModelPort) {}

  public execute(signal?: AbortSignal): Promise<ChatModelStatus> {
    return this.chatModel.getStatus(signal);
  }
}
