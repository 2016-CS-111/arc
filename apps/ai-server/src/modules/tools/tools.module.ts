import { Module, type Provider } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { LoggerModule } from "../logger/logger.module.js";
import { ToolPermissionService } from "./application/tool-permission.service.js";
import { ToolRegistryService } from "./application/tool-registry.service.js";
import { ToolRuntimeService } from "./application/tool-runtime.service.js";
import type { ToolHandler } from "./domain/tool-handler.js";
import { ArcRuntimeInfoTool } from "./infrastructure/arc-runtime-info.tool.js";
import { ARC_TOOL_HANDLERS } from "./tools.constants.js";

const toolHandlersProvider: Provider<readonly ToolHandler[]> = {
  provide: ARC_TOOL_HANDLERS,
  useFactory: (): readonly ToolHandler[] => [new ArcRuntimeInfoTool()],
};

@Module({
  imports: [ConfigModule, LoggerModule],
  providers: [toolHandlersProvider, ToolRegistryService, ToolPermissionService, ToolRuntimeService],
  exports: [ToolRuntimeService],
})
export class ToolsModule {}
