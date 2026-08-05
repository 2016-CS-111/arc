import { randomUUID } from "node:crypto";

import { AgentRunSchema, type AgentRun, type AgentRunStep } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { SendChatMessageService, type SendChatMessageEvent } from "../../chat/application/send-chat-message.service.js";
import { AgentPlanService } from "../../agent-plans/application/agent-plan.service.js";
import { AgentRunNotFoundError, AgentRunStateError } from "../domain/agent-run.errors.js";

interface StoredAgentRun {
  readonly run: AgentRun;
  abortController: AbortController | undefined;
  budgetExceeded: boolean;
  cancelRequested: boolean;
}

export interface AgentRunEvent {
  readonly run: AgentRun;
}

export interface AgentRunSubscription {
  dispose(): void;
}

@Injectable()
export class AgentRunService {
  private readonly listeners = new Set<(event: AgentRunEvent) => void>();
  private readonly runs = new Map<string, StoredAgentRun>();

  public constructor(
    @Inject(AgentPlanService) private readonly plans: AgentPlanService,
    @Inject(SendChatMessageService) private readonly chat: SendChatMessageService,
  ) {}

  public create(planId: string): AgentRun {
    const plan = this.plans.get(planId);
    const now = new Date().toISOString();
    const run = AgentRunSchema.parse({
      activeStepId: null,
      budget: { maxToolCalls: Math.min(plan.steps.length * 3, 60), toolCallsUsed: 0 },
      createdAt: now,
      goal: plan.goal,
      id: randomUUID(),
      planId: plan.id,
      projectId: plan.projectId,
      status: "pending",
      steps: plan.steps.map((step) => ({ checkpoint: null, status: "pending", step, toolCallsUsed: 0 })),
      updatedAt: now,
    });
    this.runs.set(run.id, {
      abortController: undefined,
      budgetExceeded: false,
      cancelRequested: false,
      run,
    });
    return structuredClone(run);
  }

  public get(runId: string): AgentRun {
    return structuredClone(this.requireRun(runId).run);
  }

  public start(runId: string): AgentRun {
    const stored = this.requireRun(runId);
    if (stored.run.status !== "pending") throw new AgentRunStateError("This task run has already started.");
    this.begin(stored);
    return structuredClone(stored.run);
  }

  public resume(runId: string): AgentRun {
    const stored = this.requireRun(runId);
    if (stored.run.status !== "paused") throw new AgentRunStateError("Only a paused task run can resume.");
    this.begin(stored);
    return structuredClone(stored.run);
  }

  public pause(runId: string): AgentRun {
    const stored = this.requireRun(runId);
    if (stored.run.status === "paused") return structuredClone(stored.run);
    if (stored.run.status !== "running" || stored.abortController === undefined) {
      throw new AgentRunStateError("Only a running task run can pause.");
    }
    stored.abortController.abort();
    return structuredClone(stored.run);
  }

  public cancel(runId: string): AgentRun {
    const stored = this.requireRun(runId);
    if (stored.run.status === "pending" || stored.run.status === "paused") {
      this.setStatus(stored, "cancelled");
      this.publish(stored);
      return structuredClone(stored.run);
    }
    if (stored.run.status !== "running" || stored.abortController === undefined) {
      throw new AgentRunStateError("This task run cannot be cancelled.");
    }
    stored.cancelRequested = true;
    stored.abortController.abort();
    return structuredClone(stored.run);
  }

  public subscribe(listener: (event: AgentRunEvent) => void): AgentRunSubscription {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private begin(stored: StoredAgentRun): void {
    stored.abortController = new AbortController();
    stored.budgetExceeded = false;
    stored.cancelRequested = false;
    this.setStatus(stored, "running");
    this.publish(stored);
    void this.runNext(stored, stored.abortController);
  }

  private async runNext(stored: StoredAgentRun, controller: AbortController): Promise<void> {
    const step = stored.run.steps.find((candidate) => candidate.status === "pending");
    if (step === undefined) {
      this.setStatus(stored, "completed");
      stored.abortController = undefined;
      this.publish(stored);
      return;
    }

    step.status = "running";
    stored.run.activeStepId = step.step.id;
    this.touch(stored);
    this.publish(stored);
    let summary = "";
    try {
      if (controller.signal.aborted) {
        this.finishInterrupted(stored, step, summary);
        return;
      }
      for await (const event of this.chat.stream(
        {
          clientId: `agent-run:${stored.run.id}`,
          messages: [
            {
              role: "system",
              content:
                "Execute one safe task-plan step. You may inspect project context and stage reviewable proposals, but never apply changes, run commands, or make Git changes. End with a concise checkpoint summary.",
            },
            { role: "user", content: stepPrompt(stored.run.goal, step) },
          ],
          projectId: stored.run.projectId,
          requestId: randomUUID(),
          sessionId: randomUUID(),
        },
        controller.signal,
      )) {
        summary = appendSummary(summary, event);
        if (event.type === "tool") {
          step.toolCallsUsed += 1;
          stored.run.budget.toolCallsUsed += 1;
          if (stored.run.budget.toolCallsUsed >= stored.run.budget.maxToolCalls) {
            stored.budgetExceeded = true;
            controller.abort();
          }
        }
      }
      if (stored.budgetExceeded) {
        this.finishInterrupted(stored, step, summary);
        return;
      }
      step.checkpoint = summary.trim() || `${step.step.title} prepared for review.`;
      step.status = "completed";
      stored.run.activeStepId = null;
      this.setStatus(
        stored,
        stored.run.steps.some((candidate) => candidate.status === "pending") ? "paused" : "completed",
      );
    } catch (error) {
      if (controller.signal.aborted) {
        this.finishInterrupted(stored, step, summary);
        return;
      }
      step.checkpoint = error instanceof Error ? error.message : "Arc task step failed.";
      step.status = "failed";
      stored.run.activeStepId = null;
      this.setStatus(stored, "failed");
    } finally {
      if (stored.abortController === controller) stored.abortController = undefined;
      this.touch(stored);
      this.publish(stored);
    }
  }

  private finishInterrupted(stored: StoredAgentRun, step: AgentRunStep, summary: string): void {
    if (stored.budgetExceeded) {
      step.checkpoint = summary.trim() || "Task tool-call budget reached.";
      step.status = "failed";
      stored.run.activeStepId = null;
      this.setStatus(stored, "failed");
      return;
    }

    step.checkpoint = summary.trim() || (stored.cancelRequested ? "Task run cancelled." : "Task run paused.");
    step.status = "pending";
    stored.run.activeStepId = null;
    this.setStatus(stored, stored.cancelRequested ? "cancelled" : "paused");
  }

  private requireRun(runId: string): StoredAgentRun {
    const stored = this.runs.get(runId);
    if (stored === undefined) throw new AgentRunNotFoundError(runId);
    return stored;
  }

  private setStatus(stored: StoredAgentRun, status: AgentRun["status"]): void {
    stored.run.status = status;
    this.touch(stored);
  }

  private touch(stored: StoredAgentRun): void {
    stored.run.updatedAt = new Date().toISOString();
  }

  private publish(stored: StoredAgentRun): void {
    const event: AgentRunEvent = { run: structuredClone(stored.run) };
    for (const listener of this.listeners) listener(event);
  }
}

function stepPrompt(goal: string, step: AgentRunStep): string {
  return [
    `Goal: ${goal}`,
    `Step: ${step.step.title}`,
    `Type: ${step.step.kind}`,
    `Description: ${step.step.description}`,
  ].join("\n");
}

function appendSummary(summary: string, event: SendChatMessageEvent): string {
  if (event.type === "delta") return `${summary}${event.content}`.slice(0, 8_000);
  if (event.type === "tool") return `${summary}\nUsed ${event.result.name}: ${event.result.status}.`.slice(0, 8_000);
  return summary;
}
