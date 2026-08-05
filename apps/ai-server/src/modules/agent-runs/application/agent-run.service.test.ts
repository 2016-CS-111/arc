import type { AgentPlanStep, EditProposal, TaskProposal } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { AgentPlanService } from "../../agent-plans/application/agent-plan.service.js";
import type { SendChatMessageEvent, SendChatMessageService } from "../../chat/application/send-chat-message.service.js";
import type { ProjectEditProposalService } from "../../edits/application/project-edit-proposal.service.js";
import type { TaskProposalService } from "../../tasks/application/task-proposal.service.js";
import { AgentRunService } from "./agent-run.service.js";

const projectId = "be1ce7ce-b4a6-419c-a6a2-38f499459c75";

describe("AgentRunService", () => {
  it("runs one ordered step per start or resume and records checkpoints", async () => {
    const { planId, plans } = createPlans();
    const stream = vi.fn(() => chatEvents([{ content: "Inspection complete.", type: "delta" }, { type: "completed" }]));
    const service = new AgentRunService(
      plans,
      { stream } as unknown as SendChatMessageService,
      editProposals(),
      taskProposals(),
    );
    const run = service.create(planId);

    service.start(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).status).toBe("paused");
    });
    expect(service.get(run.id).steps[0]).toMatchObject({ checkpoint: "Inspection complete.", status: "completed" });
    expect(service.get(run.id).steps[1]?.status).toBe("pending");

    service.resume(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).status).toBe("completed");
    });
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it("pauses and cancels an in-flight step without losing its checkpoint", async () => {
    const { planId, plans } = createPlans();
    let starts = 0;
    let resumed: (() => void) | undefined;
    const resumedStream = new Promise<void>((resolve) => {
      resumed = resolve;
    });
    const service = new AgentRunService(
      plans,
      {
        stream: (_input: unknown, signal: AbortSignal) =>
          cancellableEvents(signal, () => {
            starts += 1;
            if (starts === 2) resumed?.();
          }),
      } as unknown as SendChatMessageService,
      editProposals(),
      taskProposals(),
    );
    const run = service.create(planId);

    service.start(run.id);
    await vi.waitFor(() => {
      expect(starts).toBe(1);
    });
    service.pause(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).status).toBe("paused");
    });
    expect(service.get(run.id).steps[0]).toMatchObject({ checkpoint: "Inspection started.", status: "pending" });

    service.resume(run.id);
    await resumedStream;
    service.cancel(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).status).toBe("cancelled");
    });
  });

  it("fails a step when the visible tool-call budget is exhausted", async () => {
    const { planId, plans } = createPlans([step("inspect", [], "inspect")]);
    const service = new AgentRunService(
      plans,
      {
        stream: () =>
          chatEvents([
            ...Array.from({ length: 9 }, (_value, index) => toolEvent(`tool-${String(index)}`)),
            { type: "completed" },
          ]),
      } as unknown as SendChatMessageService,
      editProposals(),
      taskProposals(),
    );
    const run = service.create(planId);

    service.start(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).status).toBe("failed");
    });
    expect(service.get(run.id)).toMatchObject({ budget: { maxToolCalls: 9, toolCallsUsed: 9 } });
    expect(service.get(run.id).steps[0]).toMatchObject({ status: "failed", toolCallsUsed: 9 });
  });

  it("stages reviewable edits and stops after two failed test repair cycles", async () => {
    const { planId, plans } = createPlans([step("edit", [], "edit"), step("test", ["edit"], "test")]);
    const firstEdit = editProposal("5efae680-025a-41ff-8133-482c50538bd4", "pending");
    const firstTest = taskProposal("1a9e27cc-930a-4a27-a47b-132aebbb9eab", "pending");
    const repairEdit = editProposal("3a5dc5bf-4f2d-4c8f-84cb-17f11144c53b", "pending");
    const secondTest = taskProposal("86c93fb3-0a8d-4bc2-bd4e-304a72fa5e58", "pending");
    const finalEdit = editProposal("304b8ae6-6be7-402b-b844-4b122020528b", "pending");
    const finalTest = taskProposal("85586543-a9bd-4a13-a68e-3454496531f2", "pending");
    const edits = new Map([
      [firstEdit.id, firstEdit],
      [repairEdit.id, repairEdit],
      [finalEdit.id, finalEdit],
    ]);
    const tasks = new Map([
      [firstTest.id, firstTest],
      [secondTest.id, secondTest],
      [finalTest.id, finalTest],
    ]);
    let generation = 0;
    const stream = vi.fn(() => {
      generation += 1;
      const event = [
        proposalEvent(firstEdit, "arc.propose_edits"),
        proposalEvent(firstTest, "arc.propose_task"),
        proposalEvent(repairEdit, "arc.propose_edits"),
        proposalEvent(secondTest, "arc.propose_task"),
        proposalEvent(finalEdit, "arc.propose_edits"),
        proposalEvent(finalTest, "arc.propose_task"),
      ].at(generation - 1);
      if (event === undefined) throw new Error("Unexpected agent generation.");
      return chatEvents([event, { type: "completed" }]);
    });
    const service = new AgentRunService(
      plans,
      { stream } as unknown as SendChatMessageService,
      editProposalService(edits),
      taskProposalService(tasks),
    );
    const run = service.create(planId);

    service.start(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).steps[0]?.status).toBe("waiting");
    });
    edits.set(firstEdit.id, { ...firstEdit, status: "applied" });

    service.resume(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).steps[1]?.status).toBe("waiting");
    });
    tasks.set(firstTest.id, { ...firstTest, output: "Expected 0 to equal 1.", status: "failed" });

    service.resume(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).steps[0]).toMatchObject({ attempt: 2, status: "waiting" });
    });
    edits.set(repairEdit.id, { ...repairEdit, status: "applied" });

    service.resume(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).steps[1]?.status).toBe("waiting");
    });
    tasks.set(secondTest.id, { ...secondTest, output: "The repaired test still fails.", status: "failed" });

    service.resume(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).steps[0]).toMatchObject({ attempt: 3, status: "waiting" });
    });
    edits.set(finalEdit.id, { ...finalEdit, status: "applied" });

    service.resume(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).steps[1]?.status).toBe("waiting");
    });
    tasks.set(finalTest.id, { ...finalTest, output: "The final test fails.", status: "failed" });

    expect(service.resume(run.id)).toMatchObject({ status: "failed" });
    expect(service.get(run.id)).toMatchObject({ budget: { maxRepairAttempts: 2, repairAttempts: 2 } });
    expect(stream).toHaveBeenCalledTimes(6);
  });
});

function createPlans(
  steps: readonly AgentPlanStep[] = [step("inspect", [], "inspect"), step("edit", ["inspect"], "edit")],
): { readonly planId: string; readonly plans: AgentPlanService } {
  const plans = new AgentPlanService();
  const plan = plans.create({ goal: "Improve categories", projectId, steps });
  return { planId: plan.id, plans };
}

function step(id: string, dependsOn: readonly string[], kind: AgentPlanStep["kind"]): AgentPlanStep {
  return {
    dependsOn: [...dependsOn],
    description: `${id} description`,
    estimateMinutes: 5,
    id,
    kind,
    title: id === "edit" ? "Edit" : "Inspect",
  };
}

function toolEvent(callId: string): SendChatMessageEvent {
  return { result: { callId, content: "Inspected.", name: "arc.read_file", status: "completed" }, type: "tool" };
}

function proposalEvent(proposal: EditProposal | TaskProposal, name: string): SendChatMessageEvent {
  return {
    result: {
      callId: proposal.id,
      content: JSON.stringify({ result: { available: true, proposal } }),
      name,
      status: "completed",
    },
    type: "tool",
  };
}

function editProposals(): ProjectEditProposalService {
  return editProposalService(new Map());
}

function editProposalService(proposals: Map<string, EditProposal>): ProjectEditProposalService {
  return {
    get: (proposalId: string) => {
      const proposal = proposals.get(proposalId);
      if (proposal === undefined) throw new Error("Edit proposal missing.");
      return proposal;
    },
  } as unknown as ProjectEditProposalService;
}

function taskProposals(): TaskProposalService {
  return taskProposalService(new Map());
}

function taskProposalService(proposals: Map<string, TaskProposal>): TaskProposalService {
  return {
    get: (proposalId: string) => {
      const proposal = proposals.get(proposalId);
      if (proposal === undefined) throw new Error("Task proposal missing.");
      return proposal;
    },
  } as unknown as TaskProposalService;
}

function editProposal(id: string, status: EditProposal["status"]): EditProposal {
  return {
    createdAt: "2026-08-05T00:00:00.000Z",
    id,
    operations: [
      {
        after: "export const categories = [];\n",
        before: "export const categories = [];\n",
        id: "c34e2f65-bcc3-4792-a46f-6bf9acfa4f62",
        path: "src/categories.ts",
        type: "update",
      },
    ],
    projectId,
    rootPath: "/workspace/project",
    sessionId: "4a3d30e6-699f-4b6e-b371-bbc182ce9514",
    status,
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function taskProposal(id: string, status: TaskProposal["status"]): TaskProposal {
  return {
    approval: { kind: "standard", required: true },
    command: { args: ["run", "test"], cwd: "/workspace/project", executable: "pnpm" },
    createdAt: "2026-08-05T00:00:00.000Z",
    durationMs: null,
    exitCode: null,
    id,
    kind: "preset",
    mutates: false,
    output: "",
    projectId,
    requestId: "agent-run",
    sessionId: "4a3d30e6-699f-4b6e-b371-bbc182ce9514",
    status,
    title: "Test",
    truncated: false,
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

async function* chatEvents(events: readonly SendChatMessageEvent[]): AsyncGenerator<SendChatMessageEvent> {
  await Promise.resolve();
  yield* events;
}

async function* cancellableEvents(signal: AbortSignal, onReady: () => void): AsyncGenerator<SendChatMessageEvent> {
  yield { content: "Inspection started.", type: "delta" };
  onReady();
  if (signal.aborted) throw new Error("Task run stopped.");
  await new Promise<void>((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(new Error("Task run stopped."));
      },
      { once: true },
    );
  });
}
