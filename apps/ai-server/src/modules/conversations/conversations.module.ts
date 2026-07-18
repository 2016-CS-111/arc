import { Module, type Provider } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import { ConversationGenerationStateService } from "./application/conversation-generation-state.service.js";
import type { ConversationRepository } from "./application/conversation.repository.js";
import { ConversationSessionService } from "./application/conversation-session.service.js";
import { CONVERSATION_REPOSITORY } from "./conversations.constants.js";
import { SequelizeConversationRepository } from "./infrastructure/sequelize-conversation.repository.js";
import { ConversationsController } from "./presentation/conversations.controller.js";

const conversationRepositoryProvider: Provider<ConversationRepository> = {
  provide: CONVERSATION_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): ConversationRepository => new SequelizeConversationRepository(database),
};

@Module({
  imports: [DatabaseModule],
  controllers: [ConversationsController],
  providers: [conversationRepositoryProvider, ConversationSessionService, ConversationGenerationStateService],
  exports: [CONVERSATION_REPOSITORY, ConversationSessionService, ConversationGenerationStateService],
})
export class ConversationsModule {}
