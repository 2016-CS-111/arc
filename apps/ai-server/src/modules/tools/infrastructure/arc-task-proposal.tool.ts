import { TaskProposalRequestSchema } from "@arc/contracts";
import type { ToolCall, ToolDefinition } from "@arc/contracts";

import type { TaskProposalService } from "../../tasks/application/task-proposal.service.js";
import type { ToolExecutionContext, ToolHandler } from "../domain/tool-handler.js";

export class ArcTaskProposalTool implements ToolHandler {
  public readonly definition: ToolDefinition = {
    name: "arc.propose_task",
    description:
      "Stage a named package task or an explicit Git operation for user approval. This tool cannot run commands, Docker, or arbitrary shell input.",
    permission: "read",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { type: "string", enum: ["preset", "package_script", "git"] },
        preset: { type: "string", enum: ["test", "lint", "typecheck", "build", "format"] },
        script: { type: "string" },
        git: {
          type: "object",
          additionalProperties: false,
          properties: {
            operation: { type: "string", enum: ["add", "commit", "branch", "merge", "restore", "stash"] },
            paths: { type: "array", items: { type: "string" } },
            message: { type: "string" },
            name: { type: "string" },
            branch: { type: "string" },
          },
        },
      },
    },
  };

  public constructor(private readonly taskProposals: TaskProposalService) {}

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = TaskProposalRequestSchema.safeParse(call.arguments);
    if (!parsed.success) {
      return { available: false, reason: "invalid_arguments" };
    }
    if (context.projectId === undefined || context.clientId === undefined) {
      return { available: false, reason: "project_required" };
    }
    const proposal = await this.taskProposals.propose({
      clientId: context.clientId,
      projectId: context.projectId,
      request: parsed.data,
      requestId: context.requestId,
      sessionId: context.sessionId,
    });
    return {
      available: true,
      message: "Task is staged for explicit approval. Arc cannot run Docker or arbitrary shell commands.",
      proposal,
    };
  }
}
