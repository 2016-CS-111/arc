import { AgentPlanDraftSchema, type AgentPlan, type AgentPlanCreateRequest, type AgentPlanDraft } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import { CHAT_MODEL } from "../../inference/inference.constants.js";
import type { ChatModelToolCall, ChatModelToolDefinition } from "../../inference/domain/chat-model.types.js";
import { ProjectWorkspaceInspectionService } from "../../projects/application/project-workspace-inspection.service.js";
import { ToolCallFallbackParser } from "../../tools/application/tool-call-fallback.parser.js";
import { AgentPlanService } from "./agent-plan.service.js";

const planTool: ChatModelToolDefinition = {
  type: "function",
  function: {
    name: "arc.propose_agent_plan",
    description: "Create a bounded dependency-sorted task plan. This tool does not execute the plan.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["goal", "steps"],
      properties: {
        goal: { type: "string" },
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "description", "kind", "estimateMinutes", "dependsOn"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              kind: { type: "string", enum: ["inspect", "edit", "test"] },
              estimateMinutes: { type: "integer", minimum: 1, maximum: 240 },
              dependsOn: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class AgentPlanGenerationService {
  public constructor(
    @Inject(CHAT_MODEL) private readonly chatModel: ChatModelPort,
    @Inject(ProjectWorkspaceInspectionService) private readonly workspace: ProjectWorkspaceInspectionService,
    @Inject(AgentPlanService) private readonly plans: AgentPlanService,
  ) {}

  public async create(request: AgentPlanCreateRequest, signal: AbortSignal): Promise<AgentPlan> {
    const packageContext = await this.packageContext(request.projectId, signal);
    let content = "";
    const calls: ChatModelToolCall[] = [];
    for await (const event of this.chatModel.streamChat(
      {
        messages: [
          {
            role: "system",
            content:
              "Create a concise implementation plan only. Do not edit files, run commands, or make Git changes. Return it with arc.propose_agent_plan. Use inspect steps before edit steps and test steps after edits. Dependencies must reference earlier step ids.",
          },
          {
            role: "user",
            content: [`Goal: ${request.goal}`, `Local package context:\n${packageContext}`].join("\n\n"),
          },
        ],
        tools: [planTool],
      },
      signal,
    )) {
      if (event.type === "delta") content += event.content;
      if (event.type === "tool_calls") calls.push(...event.calls);
    }

    const call =
      calls.find((candidate) => candidate.name === planTool.function.name) ??
      new ToolCallFallbackParser().parse(content, "agent_plan_1");
    const draft = call?.name === planTool.function.name ? parseDraft(call.arguments) : undefined;
    if (draft === undefined) throw new Error("Arc could not create a task plan.");
    return this.plans.create({ goal: request.goal, projectId: request.projectId, steps: draft.steps });
  }

  private async packageContext(projectId: string, signal: AbortSignal): Promise<string> {
    const response = await this.workspace.read(projectId, "package.json", 1, 240, signal);
    if (!isReadableSource(response)) return "No package manifest is available.";
    return response.content.slice(0, 12_000);
  }
}

function parseDraft(value: unknown): AgentPlanDraft | undefined {
  const parsed = AgentPlanDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function isReadableSource(value: unknown): value is { readonly content: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "content" in value &&
    typeof (value as { readonly content?: unknown }).content === "string"
  );
}
