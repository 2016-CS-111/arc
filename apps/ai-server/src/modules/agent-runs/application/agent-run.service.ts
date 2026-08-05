import { randomUUID } from "node:crypto";

import {
  AgentRunSchema,
  EditProposalSchema,
  TaskProposalSchema,
  type AgentRun,
  type AgentRunArtifact,
  type AgentRunStep,
  type ToolResult,
} from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { AgentPlanService } from "../../agent-plans/application/agent-plan.service.js";
import { SendChatMessageService, type SendChatMessageEvent } from "../../chat/application/send-chat-message.service.js";
import { ProjectEditProposalService } from "../../edits/application/project-edit-proposal.service.js";
import { TaskProposalService } from "../../tasks/application/task-proposal.service.js";
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
    @Inject(ProjectEditProposalService) private readonly editProposals: ProjectEditProposalService,
    @Inject(TaskProposalService) private readonly taskProposals: TaskProposalService,
  ) {}

  public create(planId: string): AgentRun {
    const plan = this.plans.get(planId);
    const now = new Date().toISOString();
    const maxRepairAttempts = 2;
    const run = AgentRunSchema.parse({
      activeStepId: null,
      budget: {
        maxRepairAttempts,
        maxToolCalls: Math.min((plan.steps.length + maxRepairAttempts) * 3, 60),
        repairAttempts: 0,
        toolCallsUsed: 0,
      },
      createdAt: now,
      goal: plan.goal,
      id: randomUUID(),
      planId: plan.id,
      projectId: plan.projectId,
      status: "pending",
      steps: plan.steps.map((step) => ({
        artifacts: [],
        attempt: 1,
        checkpoint: null,
        status: "pending",
        step,
        toolCallsUsed: 0,
      })),
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
    if (this.reconcileWaitingStep(stored)) return structuredClone(stored.run);
    if (stored.run.steps.some((step) => step.status === "waiting")) {
      throw new AgentRunStateError("Finish or reject the staged task action before resuming.");
    }
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
          const artifact = artifactFromToolResult(event.result);
          if (
            artifact !== undefined &&
            !step.artifacts.some((candidate) => candidate.proposalId === artifact.proposalId)
          ) {
            step.artifacts.push(artifact);
          }
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
      stored.run.activeStepId = null;
      if (step.artifacts.length > 0) {
        step.status = "waiting";
        this.setStatus(stored, "paused");
        return;
      }
      step.status = "completed";
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

  private reconcileWaitingStep(stored: StoredAgentRun): boolean {
    const step = stored.run.steps.find((candidate) => candidate.status === "waiting");
    if (step === undefined) return false;

    step.artifacts = step.artifacts.map((artifact) => this.currentArtifact(artifact));
    const active = step.artifacts.some((artifact) => artifact.status === "pending" || artifact.status === "running");
    if (active) {
      this.touch(stored);
      this.publish(stored);
      return false;
    }

    const failedArtifact = step.artifacts.find((artifact) => !isSuccessfulArtifact(artifact));
    if (failedArtifact === undefined) {
      step.checkpoint = `${step.step.title} approved and completed.`;
      step.status = "completed";
      this.touch(stored);
      this.publish(stored);
      return false;
    }

    if (
      step.step.kind === "test" &&
      failedArtifact.kind === "task" &&
      (failedArtifact.status === "failed" || failedArtifact.status === "timed_out")
    ) {
      this.scheduleRepair(stored, step, failedArtifact);
      this.touch(stored);
      this.publish(stored);
      return stored.run.status === "failed";
    }

    step.checkpoint = `${step.step.title} ${failedArtifact.status}.`;
    step.status = "failed";
    this.setStatus(stored, "failed");
    this.publish(stored);
    return true;
  }

  private currentArtifact(artifact: AgentRunArtifact): AgentRunArtifact {
    if (artifact.kind === "edit") {
      const proposal = this.editProposals.get(artifact.proposalId);
      return {
        ...artifact,
        status: proposal.status,
        summary: `${String(proposal.operations.length)} staged edit operations.`,
      };
    }
    const proposal = this.taskProposals.get(artifact.proposalId);
    return { ...artifact, status: proposal.status, summary: taskSummary(proposal.output) };
  }

  private scheduleRepair(stored: StoredAgentRun, testStep: AgentRunStep, failedArtifact: AgentRunArtifact): void {
    const testIndex = stored.run.steps.indexOf(testStep);
    const repairStep = stored.run.steps
      .slice(0, testIndex)
      .reverse()
      .find((step) => step.step.kind === "edit");
    if (repairStep === undefined || stored.run.budget.repairAttempts >= stored.run.budget.maxRepairAttempts) {
      testStep.checkpoint = `${testStep.step.title} ${failedArtifact.status}; repair budget exhausted.`;
      testStep.status = "failed";
      this.setStatus(stored, "failed");
      return;
    }

    stored.run.budget.repairAttempts += 1;
    repairStep.artifacts = [];
    repairStep.attempt += 1;
    repairStep.checkpoint = [
      `Repair attempt ${String(repairStep.attempt)} after ${testStep.step.title} ${failedArtifact.status}.`,
      ...(failedArtifact.summary === null ? [] : [failedArtifact.summary]),
    ].join("\n");
    repairStep.status = "pending";
    testStep.artifacts = [];
    testStep.checkpoint = null;
    testStep.status = "pending";
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
  const action =
    step.step.kind === "inspect"
      ? "Inspect with read-only tools only."
      : step.step.kind === "edit"
        ? "Stage only the needed edits with arc.propose_edits, then stop for review."
        : "Stage one non-mutating test with arc.propose_task using the test preset, then stop for approval.";
  return [
    `Goal: ${goal}`,
    `Step: ${step.step.title}`,
    `Type: ${step.step.kind}`,
    `Attempt: ${String(step.attempt)}`,
    `Description: ${step.step.description}`,
    ...(step.checkpoint === null ? [] : [`Prior checkpoint: ${step.checkpoint}`]),
    action,
  ].join("\n");
}

function appendSummary(summary: string, event: SendChatMessageEvent): string {
  if (event.type === "delta") return `${summary}${event.content}`.slice(0, 8_000);
  if (event.type === "tool") return `${summary}\nUsed ${event.result.name}: ${event.result.status}.`.slice(0, 8_000);
  return summary;
}

function artifactFromToolResult(result: ToolResult): AgentRunArtifact | undefined {
  if (result.status !== "completed") return undefined;
  const proposal = proposalFromToolResult(result.content);
  const edit = EditProposalSchema.safeParse(proposal);
  if (edit.success) {
    return {
      kind: "edit",
      proposalId: edit.data.id,
      status: edit.data.status,
      summary: `${String(edit.data.operations.length)} staged edit operations.`,
    };
  }
  const task = TaskProposalSchema.safeParse(proposal);
  if (task.success) {
    return { kind: "task", proposalId: task.data.id, status: task.data.status, summary: taskSummary(task.data.output) };
  }
  return undefined;
}

function proposalFromToolResult(content: string): unknown {
  try {
    const value: unknown = JSON.parse(content);
    if (!isRecord(value) || !isRecord(value.result)) return undefined;
    return value.result.proposal;
  } catch {
    return undefined;
  }
}

function isSuccessfulArtifact(artifact: AgentRunArtifact): boolean {
  return (
    (artifact.kind === "edit" && artifact.status === "applied") ||
    (artifact.kind === "task" && artifact.status === "completed")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function taskSummary(output: string): string | null {
  const summary = output.trim().slice(-2_000);
  return summary.length === 0 ? null : summary;
}
