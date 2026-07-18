import { Module } from "@nestjs/common";

import { ConversationsModule } from "../conversations/conversations.module.js";
import { InferenceModule } from "../inference/inference.module.js";
import { LoggerModule } from "../logger/logger.module.js";
import { ActiveGenerationRegistry } from "./application/active-generation.registry.js";
import { DurableChatService } from "./application/durable-chat.service.js";
import { SendChatMessageService } from "./application/send-chat-message.service.js";
import { ChatGateway } from "./presentation/chat.gateway.js";

@Module({
  imports: [ConversationsModule, InferenceModule, LoggerModule],
  providers: [ActiveGenerationRegistry, DurableChatService, SendChatMessageService, ChatGateway],
})
export class ChatModule {}
