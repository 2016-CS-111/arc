import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import type { ChatModelEvent, ChatModelStatus } from "../../inference/domain/chat-model.types.js";
import type { ProjectWorkspaceInspectionService } from "../../projects/application/project-workspace-inspection.service.js";
import { describe, expect, it, vi } from "vitest";

import { AgentPlanGenerationService } from "./agent-plan-generation.service.js";
import { AgentPlanService } from "./agent-plan.service.js";

const projectId = "be1ce7ce-b4a6-419c-a6a2-38f499459c75";

describe("AgentPlanGenerationService", () => {
  it("turns a native tool call into a dependency-sorted draft plan", async () => {
    const streamChat = vi.fn(() =>
      modelEvents([
        {
          calls: [
            {
              arguments: draft(),
              id: "plan_1",
              name: "arc.propose_agent_plan",
            },
          ],
          type: "tool_calls",
        },
        { type: "completed" },
      ]),
    );
    const service = new AgentPlanGenerationService(
      { getStatus: status, streamChat } satisfies ChatModelPort,
      {
        read: vi.fn(() => Promise.resolve({ available: true, content: '{"scripts":{"test":"vitest"}}' })),
      } as unknown as ProjectWorkspaceInspectionService,
      new AgentPlanService(),
    );

    const plan = await service.create({ goal: "Add categories", projectId }, new AbortController().signal);

    expect(plan.goal).toBe("Add categories");
    expect(plan.steps.map((step) => step.id)).toEqual(["inspect", "edit", "test"]);
    expect(streamChat).toHaveBeenCalledTimes(1);
  });

  it("supports the compact tool-call fallback for local models", async () => {
    const content = `<arc_tool_call>${JSON.stringify({ arguments: draft(), name: "arc.propose_agent_plan" })}</arc_tool_call>`;
    const service = new AgentPlanGenerationService(
      {
        getStatus: status,
        streamChat: () => modelEvents([{ content, type: "delta" }, { type: "completed" }]),
      } satisfies ChatModelPort,
      { read: vi.fn(() => Promise.resolve({ available: false })) } as unknown as ProjectWorkspaceInspectionService,
      new AgentPlanService(),
    );

    await expect(
      service.create({ goal: "Add categories", projectId }, new AbortController().signal),
    ).resolves.toMatchObject({
      goal: "Add categories",
      totalEstimateMinutes: 35,
    });
  });
});

function draft() {
  return {
    goal: "Add categories",
    steps: [
      {
        dependsOn: ["edit"],
        description: "Verify the change.",
        estimateMinutes: 10,
        id: "test",
        kind: "test",
        title: "Test",
      },
      {
        dependsOn: ["inspect"],
        description: "Implement the page.",
        estimateMinutes: 20,
        id: "edit",
        kind: "edit",
        title: "Edit",
      },
      {
        dependsOn: [],
        description: "Read the existing routes.",
        estimateMinutes: 5,
        id: "inspect",
        kind: "inspect",
        title: "Inspect",
      },
    ],
  };
}

async function* modelEvents(events: readonly ChatModelEvent[]): AsyncGenerator<ChatModelEvent> {
  await Promise.resolve();
  yield* events;
}

function status(): Promise<ChatModelStatus> {
  return Promise.resolve({ latencyMs: 1, model: "qwen2.5-coder:7b", status: "ready" });
}
