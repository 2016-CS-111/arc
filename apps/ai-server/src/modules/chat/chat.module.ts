import { Module } from "@nestjs/common";

import { InferenceModule } from "../inference/inference.module.js";
import { LoggerModule } from "../logger/logger.module.js";
import { ActiveGenerationRegistry } from "./application/active-generation.registry.js";
import { SendChatMessageService } from "./application/send-chat-message.service.js";
import { ChatGateway } from "./presentation/chat.gateway.js";

@Module({
  imports: [InferenceModule, LoggerModule],
  providers: [ActiveGenerationRegistry, SendChatMessageService, ChatGateway],
})
export class ChatModule {}
