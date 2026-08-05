import { AgentPlanSchema, type AgentPlan } from "@arc/contracts";
import * as vscode from "vscode";

import type { AgentPlanClientPort } from "../../infrastructure/backend/AgentPlanClient.js";

export class TaskPlanDocumentController implements vscode.Disposable {
  public static readonly planCommand = "arc.planTask";
  public static readonly saveCommand = "arc.saveTaskPlan";

  private readonly documentPlans = new Map<string, string>();

  public constructor(
    private readonly plans: AgentPlanClientPort,
    private readonly projectIdProvider: () => string | undefined,
  ) {}

  public dispose(): void {
    this.documentPlans.clear();
  }

  public async plan(): Promise<void> {
    const projectId = this.projectIdProvider();
    if (projectId === undefined) {
      await vscode.window.showWarningMessage("Register this workspace with Arc before planning a task.");
      return;
    }
    const goal = await vscode.window.showInputBox({ placeHolder: "Describe the development task" });
    if (goal === undefined || goal.trim().length === 0) return;

    try {
      await this.open(await this.plans.create({ goal, projectId }));
    } catch (error) {
      await vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Arc could not create a task plan.",
      );
    }
  }

  public async saveActivePlan(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return;
    const planId = this.documentPlans.get(editor.document.uri.toString());
    if (planId === undefined) {
      await vscode.window.showWarningMessage("Open an Arc task plan before saving it.");
      return;
    }

    let plan: AgentPlan;
    try {
      plan = AgentPlanSchema.parse(JSON.parse(editor.document.getText()) as unknown);
    } catch {
      await vscode.window.showErrorMessage("Fix the task plan JSON before saving it.");
      return;
    }
    try {
      const updated = await this.plans.update(planId, { goal: plan.goal, steps: plan.steps });
      const edit = new vscode.WorkspaceEdit();
      edit.replace(editor.document.uri, fullRange(editor.document), JSON.stringify(updated, null, 2));
      await vscode.workspace.applyEdit(edit);
      await vscode.window.showInformationMessage("Arc task plan saved.");
    } catch (error) {
      await vscode.window.showErrorMessage(
        error instanceof Error ? error.message : "Arc could not save the task plan.",
      );
    }
  }

  private async open(plan: AgentPlan): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: JSON.stringify(plan, null, 2),
      language: "json",
    });
    this.documentPlans.set(document.uri.toString(), plan.id);
    await vscode.window.showTextDocument(document, { preview: false });
  }
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  const lastLine = document.lineAt(document.lineCount - 1);
  return new vscode.Range(0, 0, document.lineCount - 1, lastLine.range.end.character);
}
