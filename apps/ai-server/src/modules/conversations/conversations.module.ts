import { Module, type Provider } from "@nestjs/common";
import type { Pool } from "pg";

import { DATABASE_POOL } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import { ConversationGenerationStateService } from "./application/conversation-generation-state.service.js";
import type { ConversationRepository } from "./application/conversation.repository.js";
import { ConversationSessionService } from "./application/conversation-session.service.js";
import { CONVERSATION_REPOSITORY } from "./conversations.constants.js";
import { PostgresConversationRepository } from "./infrastructure/postgres-conversation.repository.js";

const conversationRepositoryProvider: Provider<ConversationRepository> = {
  provide: CONVERSATION_REPOSITORY,
  inject: [DATABASE_POOL],
  useFactory: (pool: Pool): ConversationRepository => new PostgresConversationRepository(pool),
};

@Module({
  imports: [DatabaseModule],
  providers: [conversationRepositoryProvider, ConversationSessionService, ConversationGenerationStateService],
  exports: [CONVERSATION_REPOSITORY, ConversationSessionService, ConversationGenerationStateService],
})
export class ConversationsModule {}
