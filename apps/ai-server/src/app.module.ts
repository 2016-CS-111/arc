import { Module } from "@nestjs/common";

import { ConfigModule } from "./config/config.module.js";
import { CompletionsModule } from "./modules/completions/completions.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { ChatModule } from "./modules/chat/chat.module.js";
import { ConversationsModule } from "./modules/conversations/conversations.module.js";
import { EmbeddingsModule } from "./modules/embeddings/embeddings.module.js";
import { EditsModule } from "./modules/edits/edits.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { GuidedActionsModule } from "./modules/guided-actions/guided-actions.module.js";
import { InferenceModule } from "./modules/inference/inference.module.js";
import { LoggerModule } from "./modules/logger/logger.module.js";
import { MemoriesModule } from "./modules/memories/memories.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    LoggerModule,
    HealthModule,
    GuidedActionsModule,
    InferenceModule,
    CompletionsModule,
    EmbeddingsModule,
    RealtimeModule,
    EditsModule,
    TasksModule,
    MemoriesModule,
    ChatModule,
    ConversationsModule,
    ProjectsModule,
  ],
})
export class AppModule {}
