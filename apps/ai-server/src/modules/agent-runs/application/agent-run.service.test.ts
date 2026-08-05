import type { AgentPlanStep } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { AgentPlanService } from "../../agent-plans/application/agent-plan.service.js";
import type { SendChatMessageEvent, SendChatMessageService } from "../../chat/application/send-chat-message.service.js";
import { AgentRunService } from "./agent-run.service.js";

const projectId = "be1ce7ce-b4a6-419c-a6a2-38f499459c75";

describe("AgentRunService", () => {
  it("runs one ordered step per start or resume and records checkpoints", async () => {
    const { planId, plans } = createPlans();
    const stream = vi.fn(() => chatEvents([{ content: "Inspection complete.", type: "delta" }, { type: "completed" }]));
    const service = new AgentRunService(plans, { stream } as unknown as SendChatMessageService);
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
    const service = new AgentRunService(plans, {
      stream: (_input: unknown, signal: AbortSignal) =>
        cancellableEvents(signal, () => {
          starts += 1;
          if (starts === 2) resumed?.();
        }),
    } as unknown as SendChatMessageService);
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
    const service = new AgentRunService(plans, {
      stream: () => chatEvents([toolEvent("one"), toolEvent("two"), toolEvent("three"), { type: "completed" }]),
    } as unknown as SendChatMessageService);
    const run = service.create(planId);

    service.start(run.id);
    await vi.waitFor(() => {
      expect(service.get(run.id).status).toBe("failed");
    });
    expect(service.get(run.id)).toMatchObject({ budget: { maxToolCalls: 3, toolCallsUsed: 3 } });
    expect(service.get(run.id).steps[0]).toMatchObject({ status: "failed", toolCallsUsed: 3 });
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
