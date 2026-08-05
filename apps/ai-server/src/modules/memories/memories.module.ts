import { Module, type Provider } from "@nestjs/common";

import { DATABASE } from "../../database/database.constants.js";
import { DatabaseModule } from "../../database/database.module.js";
import type { ArcDatabase } from "../../database/database.types.js";
import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { SecurityModule } from "../security/security.module.js";
import type { MemoryRepository } from "./application/memory.repository.js";
import { MemoryProposalService } from "./application/memory-proposal.service.js";
import { MemoryService } from "./application/memory.service.js";
import { MEMORY_REPOSITORY } from "./memories.constants.js";
import { SequelizeMemoryRepository } from "./infrastructure/sequelize-memory.repository.js";
import { MemoriesController } from "./presentation/memories.controller.js";
import { MemoryProposalsController } from "./presentation/memory-proposals.controller.js";

const memoryRepositoryProvider: Provider<MemoryRepository> = {
  provide: MEMORY_REPOSITORY,
  inject: [DATABASE],
  useFactory: (database: ArcDatabase): MemoryRepository => new SequelizeMemoryRepository(database),
};

@Module({
  imports: [DatabaseModule, EmbeddingsModule, ProjectsModule, SecurityModule],
  controllers: [MemoriesController, MemoryProposalsController],
  providers: [memoryRepositoryProvider, MemoryService, MemoryProposalService],
  exports: [MemoryService, MemoryProposalService],
})
export class MemoriesModule {}
