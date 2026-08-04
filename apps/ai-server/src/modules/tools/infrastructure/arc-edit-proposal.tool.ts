import { EditProposalRequestSchema } from "@arc/contracts";
import type { ToolCall, ToolDefinition } from "@arc/contracts";

import type { ProjectEditProposalService } from "../../edits/application/project-edit-proposal.service.js";
import type { ToolExecutionContext, ToolHandler } from "../domain/tool-handler.js";

export class ArcEditProposalTool implements ToolHandler {
  public readonly definition: ToolDefinition = {
    name: "arc.propose_edits",
    description:
      "Stage a bounded set of project file creates, updates, deletes, or moves for explicit VS Code diff review. This tool never applies changes.",
    permission: "read",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["operations"],
      properties: {
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "path"],
            properties: {
              type: { type: "string", enum: ["create", "update", "delete", "move"] },
              path: { type: "string" },
              fromPath: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      },
    },
  };

  public constructor(private readonly editProposals: ProjectEditProposalService) {}

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = EditProposalRequestSchema.safeParse(call.arguments);
    if (!parsed.success) {
      return { available: false, reason: "invalid_arguments" };
    }
    if (context.projectId === undefined) {
      return { available: false, reason: "project_required" };
    }

    const proposal = await this.editProposals.propose({
      operations: parsed.data.operations,
      projectId: context.projectId,
      sessionId: context.sessionId,
      signal: context.signal,
    });
    return {
      available: true,
      message: "Edits are staged for explicit VS Code diff review and approval.",
      proposal,
    };
  }
}
