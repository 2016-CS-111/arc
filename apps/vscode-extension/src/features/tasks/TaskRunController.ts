import { AgentPlanSchema, type AgentPlan, type AgentRun } from "@arc/contracts";
import * as vscode from "vscode";

import type { AgentRunClientPort } from "../../infrastructure/backend/AgentRunClient.js";

export class TaskRunController implements vscode.Disposable {
  public static readonly cancelCommand = "arc.cancelTaskRun";
  public static readonly pauseCommand = "arc.pauseTaskRun";
  public static readonly resumeCommand = "arc.resumeTaskRun";
  public static readonly startCommand = "arc.startTaskRun";

  private readonly activeRuns = new Map<string, string>();
  private readonly monitoringRuns = new Set<string>();
  private readonly output = vscode.window.createOutputChannel("Arc Agent Tasks");
  private readonly reportedVersions = new Map<string, string>();

  public constructor(private readonly runs: AgentRunClientPort) {}

  public dispose(): void {
    this.activeRuns.clear();
    this.monitoringRuns.clear();
    this.reportedVersions.clear();
    this.output.dispose();
  }

  public async start(): Promise<void> {
    const activePlan = this.activePlan();
    if (activePlan === undefined) return;
    try {
      const created = await this.runs.create({ planId: activePlan.plan.id });
      this.activeRuns.set(activePlan.key, created.id);
      this.report(await this.runs.start(created.id));
      this.output.show(true);
      this.monitor(created.id);
    } catch (error) {
      await this.showError(error);
    }
  }

  public async resume(): Promise<void> {
    await this.transition("resume", (runId) => this.runs.resume(runId));
  }

  public async pause(): Promise<void> {
    await this.transition("pause", (runId) => this.runs.pause(runId));
  }

  public async cancel(): Promise<void> {
    await this.transition("cancel", (runId) => this.runs.cancel(runId));
  }

  private async transition(action: string, request: (runId: string) => Promise<AgentRun>): Promise<void> {
    const runId = this.activeRunId();
    if (runId === undefined) return;
    try {
      this.report(await request(runId));
      this.output.show(true);
      if (action === "resume") this.monitor(runId);
    } catch (error) {
      await this.showError(error);
    }
  }

  private activePlan(): { readonly key: string; readonly plan: AgentPlan } | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      void vscode.window.showWarningMessage("Open an Arc task plan before starting a task run.");
      return undefined;
    }
    try {
      return {
        key: editor.document.uri.toString(),
        plan: AgentPlanSchema.parse(JSON.parse(editor.document.getText())),
      };
    } catch {
      void vscode.window.showWarningMessage("Open a valid Arc task plan before starting a task run.");
      return undefined;
    }
  }

  private activeRunId(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    const runId = editor === undefined ? undefined : this.activeRuns.get(editor.document.uri.toString());
    if (runId === undefined) void vscode.window.showWarningMessage("Start an Arc task run from this task plan first.");
    return runId;
  }

  private monitor(runId: string): void {
    if (this.monitoringRuns.has(runId)) return;
    this.monitoringRuns.add(runId);
    void this.watch(runId);
  }

  private async watch(runId: string): Promise<void> {
    try {
      for (;;) {
        const run = await this.runs.get(runId);
        this.report(run);
        if (run.status !== "running") return;
        await delay(500);
      }
    } catch (error) {
      await this.showError(error);
    } finally {
      this.monitoringRuns.delete(runId);
    }
  }

  private report(run: AgentRun): void {
    const activeStep = run.steps.find((step) => step.step.id === run.activeStepId);
    const checkpoint = activeStep?.checkpoint ?? lastCheckpoint(run);
    const version = [run.updatedAt, run.status, run.activeStepId, run.budget.toolCallsUsed, checkpoint].join("|");
    if (this.reportedVersions.get(run.id) === version) return;
    this.reportedVersions.set(run.id, version);
    this.output.appendLine(
      `[${run.status}] ${activeStep?.step.title ?? run.goal} (${String(run.budget.toolCallsUsed)}/${String(run.budget.maxToolCalls)} tools)${checkpoint === undefined ? "" : `\n${checkpoint}`}`,
    );
  }

  private async showError(error: unknown): Promise<void> {
    await vscode.window.showErrorMessage(error instanceof Error ? error.message : "Arc task run failed.");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function lastCheckpoint(run: AgentRun): string | undefined {
  for (const step of [...run.steps].reverse()) {
    if (step.checkpoint !== null) return step.checkpoint;
  }
  return undefined;
}
