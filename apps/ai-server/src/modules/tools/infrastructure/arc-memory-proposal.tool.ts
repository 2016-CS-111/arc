import { MemoryProposalRequestSchema } from "@arc/contracts";
import type { ToolCall, ToolDefinition } from "@arc/contracts";

import type { MemoryProposalService } from "../../memories/application/memory-proposal.service.js";
import type { ToolExecutionContext, ToolHandler } from "../domain/tool-handler.js";

export class ArcMemoryProposalTool implements ToolHandler {
  public readonly definition: ToolDefinition = {
    name: "arc.propose_memory",
    description: "Suggest a compact durable memory for explicit user approval. This tool never stores memory itself.",
    permission: "read",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["content", "kind", "scope"],
      properties: {
        content: { type: "string" },
        kind: { type: "string", enum: ["user", "project", "architecture", "convention", "decision", "business_rule"] },
        scope: { type: "string", enum: ["user", "project"] },
        confidence: { type: "number" },
        pinned: { type: "boolean" },
        expiresAt: { type: ["string", "null"] },
      },
    },
  };

  public constructor(private readonly memoryProposals: MemoryProposalService) {}

  public execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const parsed = MemoryProposalRequestSchema.safeParse(call.arguments);
    if (!parsed.success) {
      return Promise.resolve({ available: false, reason: "invalid_arguments" });
    }
    if (parsed.data.scope === "project" && context.projectId === undefined) {
      return Promise.resolve({ available: false, reason: "project_required" });
    }
    return Promise.resolve({
      available: true,
      message: "Memory is staged for explicit approval.",
      proposal: this.memoryProposals.propose({
        projectId: context.projectId,
        request: parsed.data,
        requestId: context.requestId,
        sessionId: context.sessionId,
      }),
    });
  }
}
