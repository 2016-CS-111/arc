import { randomUUID } from "node:crypto";

import type { GuidedCodeActionKind, GuidedCodeActionResponse, TaskProposal } from "@arc/contracts";
import * as vscode from "vscode";

import type { EditProposalClientPort } from "../../infrastructure/backend/EditProposalClient.js";
import type { GuidedCodeActionClientPort } from "../../infrastructure/backend/GuidedCodeActionClient.js";
import type { TaskProposalClientPort } from "../../infrastructure/backend/TaskProposalClient.js";
import type { EditDiffPreviewPort } from "../edits/EditDiffPreviewService.js";
import type { TaskOutputPort } from "../tasks/TaskOutputService.js";
import { buildGuidedCodeActionRequest } from "./guidedCodeActionContext.js";

export interface GuidedCodeActionCommand {
  readonly action: GuidedCodeActionKind;
  readonly diagnostic?: string;
  readonly range: { readonly end: Position; readonly start: Position };
  readonly sourceVersion: number;
  readonly uri: string;
}

interface Position {
  readonly character: number;
  readonly line: number;
}

export class ArcGuidedCodeActionController implements vscode.Disposable {
  public static readonly command = "arc.runGuidedCodeAction";

  private readonly activeRequests = new Map<string, AbortController>();
  private readonly output = vscode.window.createOutputChannel("Arc Actions");

  public constructor(
    private readonly actions: GuidedCodeActionClientPort,
    private readonly editProposals: EditProposalClientPort,
    private readonly editPreview: EditDiffPreviewPort,
    private readonly taskProposals: TaskProposalClientPort,
    private readonly taskOutput: TaskOutputPort,
    private readonly projectIdProvider: () => string | undefined,
  ) {}

  public dispose(): void {
    for (const controller of this.activeRequests.values()) controller.abort();
    this.activeRequests.clear();
    this.output.dispose();
  }

  public async execute(command: GuidedCodeActionCommand): Promise<void> {
    const uri = vscode.Uri.parse(command.uri);
    const range = new vscode.Range(
      command.range.start.line,
      command.range.start.character,
      command.range.end.line,
      command.range.end.character,
    );
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.isDirty) {
      await vscode.window.showWarningMessage("Save the document before running an Arc editor action.");
      return;
    }
    if (document.version !== command.sourceVersion) {
      await vscode.window.showInformationMessage("The document changed. Run the Arc action again.");
      return;
    }
    const projectId = this.projectIdProvider();
    if (projectId === undefined) {
      await vscode.window.showWarningMessage("Register this workspace with Arc before using editor actions.");
      return;
    }

    const request = buildGuidedCodeActionRequest({
      action: command.action,
      diagnostic: command.diagnostic,
      language: document.languageId,
      path: vscode.workspace.asRelativePath(document.uri, false),
      projectId,
      range: command.range,
      requestId: randomUUID(),
      source: document.getText(range.isEmpty ? undefined : range),
      sourceVersion: document.version,
    });
    const key = uri.toString();
    this.activeRequests.get(key)?.abort();
    const controller = new AbortController();
    this.activeRequests.set(key, controller);
    const cancelBackend = (): void => {
      void this.actions.cancel(request.requestId).catch(() => undefined);
    };
    controller.signal.addEventListener("abort", cancelBackend, { once: true });

    try {
      const response = await this.actions.execute(request, controller.signal);
      if (controller.signal.aborted) return;
      if (document.version !== command.sourceVersion) {
        await this.discard(response);
        await vscode.window.showInformationMessage("The document changed while Arc was preparing the action.");
        return;
      }
      await this.present(response);
    } catch (error) {
      if (!controller.signal.aborted) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : "Arc editor action failed.");
      }
    } finally {
      controller.signal.removeEventListener("abort", cancelBackend);
      if (this.activeRequests.get(key) === controller) this.activeRequests.delete(key);
    }
  }

  private async present(response: GuidedCodeActionResponse): Promise<void> {
    this.output.appendLine(response.explanation);
    if (response.proposal === null) {
      this.output.show(true);
      return;
    }

    const firstOperation = response.proposal.operations.at(0);
    if (firstOperation === undefined) return;
    await this.editPreview.show(response.proposal, firstOperation.id);
    const decision = await vscode.window.showInformationMessage(response.explanation, "Apply", "Reject");
    if (decision !== "Apply") {
      await this.discard(response);
      return;
    }
    if (this.editPreview.hasDirtyDocuments(response.proposal)) {
      await this.discard(response);
      await vscode.window.showWarningMessage("Save or revert the affected open files before applying Arc edits.");
      return;
    }

    const applied = await this.editProposals.approve(response.proposal.id, {
      operationIds: response.proposal.operations.map((operation) => operation.id),
    });
    const options = ["Undo", ...(response.validation === null ? [] : ["Run tests", "Skip tests"])];
    const next = await vscode.window.showInformationMessage("Arc applied the reviewed edits.", ...options);
    if (next === "Undo") {
      await this.editProposals.undo(applied.id);
      await this.discardValidation(response.validation);
      await vscode.window.showInformationMessage("Arc edits were undone.");
      return;
    }
    if (next === "Run tests" && response.validation !== null) {
      await this.runValidation(response.validation);
      return;
    }
    await this.discardValidation(response.validation);
  }

  private async discard(response: GuidedCodeActionResponse): Promise<void> {
    await Promise.all([
      ...(response.proposal === null ? [] : [this.editProposals.reject(response.proposal.id)]),
      ...(response.validation === null ? [] : [this.taskProposals.reject(response.validation.id)]),
    ]);
  }

  private async discardValidation(validation: TaskProposal | null): Promise<void> {
    if (validation !== null) await this.taskProposals.reject(validation.id);
  }

  private async runValidation(validation: TaskProposal): Promise<void> {
    let current = await this.taskProposals.approve(validation.id);
    this.taskOutput.append(current);
    this.taskOutput.show();
    while (current.status === "running") {
      await delay(400);
      current = await this.taskProposals.get(validation.id);
      this.taskOutput.append(current);
    }
    await vscode.window.showInformationMessage(`Arc validation ${current.status}.`);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
