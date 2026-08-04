import { Module, type Provider } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { LoggerModule } from "../logger/logger.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { ProjectGitInspectionService } from "../projects/application/project-git-inspection.service.js";
import { ProjectSemanticSearchService } from "../projects/application/project-semantic-search.service.js";
import { ProjectSymbolSearchService } from "../projects/application/project-symbol-search.service.js";
import { ProjectWorkspaceInspectionService } from "../projects/application/project-workspace-inspection.service.js";
import { ToolPermissionService } from "./application/tool-permission.service.js";
import { ToolRegistryService } from "./application/tool-registry.service.js";
import { ToolRuntimeService } from "./application/tool-runtime.service.js";
import type { ToolHandler } from "./domain/tool-handler.js";
import { ArcRuntimeInfoTool } from "./infrastructure/arc-runtime-info.tool.js";
import { createReadOnlyProjectToolHandlers } from "./infrastructure/arc-readonly-project.tools.js";
import { ARC_TOOL_HANDLERS } from "./tools.constants.js";

const toolHandlersProvider: Provider<readonly ToolHandler[]> = {
  provide: ARC_TOOL_HANDLERS,
  inject: [
    ProjectWorkspaceInspectionService,
    ProjectSymbolSearchService,
    ProjectSemanticSearchService,
    ProjectGitInspectionService,
  ],
  useFactory: (
    workspace: ProjectWorkspaceInspectionService,
    symbols: ProjectSymbolSearchService,
    semanticSearch: ProjectSemanticSearchService,
    git: ProjectGitInspectionService,
  ): readonly ToolHandler[] => [new ArcRuntimeInfoTool(), ...createReadOnlyProjectToolHandlers(workspace, symbols, semanticSearch, git)],
};

@Module({
  imports: [ConfigModule, LoggerModule, ProjectsModule],
  providers: [toolHandlersProvider, ToolRegistryService, ToolPermissionService, ToolRuntimeService],
  exports: [ToolRuntimeService],
})
export class ToolsModule {}
