import type { ToolDefinition } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { ARC_TOOL_HANDLERS } from "../tools.constants.js";
import type { ToolHandler } from "../domain/tool-handler.js";

@Injectable()
export class ToolRegistryService {
  private readonly handlers = new Map<string, ToolHandler>();

  public constructor(@Inject(ARC_TOOL_HANDLERS) toolHandlers: readonly ToolHandler[]) {
    for (const handler of toolHandlers) {
      if (this.handlers.has(handler.definition.name)) {
        throw new Error(`Arc tool '${handler.definition.name}' is registered more than once.`);
      }

      this.handlers.set(handler.definition.name, handler);
    }
  }

  public getDefinitions(): readonly ToolDefinition[] {
    return [...this.handlers.values()].map((handler) => handler.definition);
  }

  public find(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }
}
