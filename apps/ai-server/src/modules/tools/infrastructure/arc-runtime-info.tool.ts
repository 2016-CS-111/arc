import type { ToolCall, ToolDefinition } from "@arc/contracts";

import type { ToolExecutionContext, ToolHandler } from "../domain/tool-handler.js";

export class ArcRuntimeInfoTool implements ToolHandler {
  public readonly definition: ToolDefinition = {
    name: "arc.runtime_info",
    description: "Return Arc tool runtime metadata. Use only when the user asks about Arc runtime capabilities.",
    permission: "none",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  };

  public execute(_call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    return Promise.resolve({
      projectAttached: context.projectId !== undefined,
      runtime: "arc",
      toolRuntimeVersion: 1,
    });
  }
}
