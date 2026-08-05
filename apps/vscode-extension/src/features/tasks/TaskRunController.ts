import { AgentPlanSchema, type AgentPlan, type AgentRun, type AgentRunReport, type TaskProposal } from "@arc/contracts";
import * as vscode from "vscode";

import type { AgentRunClientPort } from "../../infrastructure/backend/AgentRunClient.js";
import type { EditProposalClientPort } from "../../infrastructure/backend/EditProposalClient.js";
import type { TaskProposalClientPort } from "../../infrastructure/backend/TaskProposalClient.js";
import type { EditDiffPreviewPort } from "../edits/EditDiffPreviewService.js";
import type { TaskOutputPort } from "./TaskOutputService.js";

export class TaskRunController implements vscode.Disposable {
  public static readonly cancelCommand = "arc.cancelTaskRun";
  public static readonly pauseCommand = "arc.pauseTaskRun";
  public static readonly resumeCommand = "arc.resumeTaskRun";
  public static readonly startCommand = "arc.startTaskRun";

  private readonly activeRuns = new Map<string, string>();
  private readonly monitoringRuns = new Set<string>();
  private readonly output = vscode.window.createOutputChannel("Arc Agent Tasks");
  private readonly reportedVersions = new Map<string, string>();
  private readonly reportedFinalRuns = new Set<string>();
  private readonly reviewedArtifacts = new Set<string>();

  public constructor(
    private readonly runs: AgentRunClientPort,
    private readonly editProposals: EditProposalClientPort,
    private readonly editPreview: EditDiffPreviewPort,
    private readonly taskProposals: TaskProposalClientPort,
    private readonly taskOutput: TaskOutputPort,
  ) {}

  public dispose(): void {
    this.activeRuns.clear();
    this.monitoringRuns.clear();
    this.reportedVersions.clear();
    this.reportedFinalRuns.clear();
    this.reviewedArtifacts.clear();
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
        if (run.status !== "running") {
          await this.reviewWaitingArtifacts(run);
          if (isTerminal(run)) await this.reportFinal(run.id);
          return;
        }
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
    const version = [
      run.updatedAt,
      run.status,
      run.activeStepId,
      run.budget.toolCallsUsed,
      run.budget.repairAttempts,
      checkpoint,
    ].join("|");
    if (this.reportedVersions.get(run.id) === version) return;
    this.reportedVersions.set(run.id, version);
    this.output.appendLine(
      `[${run.status}] ${activeStep?.step.title ?? run.goal} (${String(run.budget.toolCallsUsed)}/${String(run.budget.maxToolCalls)} tools, ${String(run.budget.repairAttempts)}/${String(run.budget.maxRepairAttempts)} repairs)${checkpoint === undefined ? "" : `\n${checkpoint}`}`,
    );
  }

  private async reviewWaitingArtifacts(run: AgentRun): Promise<void> {
    for (const step of run.steps) {
      if (step.status !== "waiting") continue;
      for (const artifact of step.artifacts) {
        if (artifact.status !== "pending") continue;
        const key = `${run.id}:${artifact.proposalId}`;
        if (this.reviewedArtifacts.has(key)) continue;
        this.reviewedArtifacts.add(key);
        if (artifact.kind === "edit") {
          await this.reviewEditArtifact(artifact.proposalId, key);
        } else {
          await this.reviewTaskArtifact(artifact.proposalId);
        }
      }
    }
  }

  private async reviewEditArtifact(proposalId: string, key: string): Promise<void> {
    const proposal = await this.editProposals.get(proposalId);
    if (proposal.status !== "pending") return;
    const firstOperation = proposal.operations.at(0);
    if (firstOperation === undefined) return;
    await this.editPreview.show(proposal, firstOperation.id);
    const decision = await vscode.window.showInformationMessage("Arc staged task edits for review.", "Apply", "Reject");
    if (decision === "Apply") {
      if (this.editPreview.hasDirtyDocuments(proposal)) {
        this.reviewedArtifacts.delete(key);
        await vscode.window.showWarningMessage("Save or revert the affected open files before applying Arc edits.");
        return;
      }
      await this.editProposals.approve(proposal.id, {
        operationIds: proposal.operations.map((operation) => operation.id),
      });
      this.output.appendLine("[applied] Task edits are ready. Resume the Arc task run.");
      return;
    }
    await this.editProposals.reject(proposal.id);
    this.output.appendLine("[rejected] Task edits were rejected. Resume the Arc task run to record the outcome.");
  }

  private async reviewTaskArtifact(proposalId: string): Promise<void> {
    const proposal = await this.taskProposals.get(proposalId);
    if (proposal.status !== "pending") return;
    const decision = await taskApprovalPrompt(proposal);
    if (decision !== "Run") {
      await this.taskProposals.reject(proposal.id);
      this.output.appendLine("[rejected] Task command was rejected. Resume the Arc task run to record the outcome.");
      return;
    }
    await this.monitorTask(proposal.id);
  }

  private async monitorTask(proposalId: string): Promise<void> {
    let proposal = await this.taskProposals.approve(proposalId);
    this.taskOutput.append(proposal);
    this.taskOutput.show();
    while (proposal.status === "running") {
      await delay(400);
      proposal = await this.taskProposals.get(proposalId);
      this.taskOutput.append(proposal);
    }
    this.output.appendLine(`[${proposal.status}] ${proposal.title}. Resume the Arc task run.`);
  }

  private async reportFinal(runId: string): Promise<void> {
    if (this.reportedFinalRuns.has(runId)) return;
    try {
      this.appendFinalReport(await this.runs.report(runId));
      this.reportedFinalRuns.add(runId);
    } catch (error) {
      this.output.appendLine(
        `[report unavailable] ${error instanceof Error ? error.message : "Arc task report failed."}`,
      );
    }
  }

  private appendFinalReport(report: AgentRunReport): void {
    this.output.appendLine(`[final report] ${report.outcome}`);
    for (const change of report.changes) {
      this.output.appendLine(`[change ${change.status}] ${change.summary ?? change.proposalId}`);
    }
    for (const test of report.tests) {
      this.output.appendLine(`[test ${test.status}] ${test.summary ?? test.proposalId}`);
    }
    for (const guidance of report.rollbackGuidance) {
      this.output.appendLine(`[rollback] ${guidance}`);
    }
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

function isTerminal(run: AgentRun): boolean {
  return run.status === "completed" || run.status === "cancelled" || run.status === "failed";
}

function taskApprovalPrompt(proposal: TaskProposal): Thenable<string | undefined> {
  const message =
    proposal.approval.kind === "standard"
      ? `Run Arc task: ${proposal.title}?`
      : `Confirm ${approvalLabel(proposal.approval.kind)}: ${proposal.title}?`;
  return proposal.approval.kind === "standard"
    ? vscode.window.showInformationMessage(message, "Run", "Reject")
    : vscode.window.showWarningMessage(message, "Run", "Reject");
}

function approvalLabel(kind: TaskProposal["approval"]["kind"]): string {
  return kind.replace(/_/gu, " ");
}
