import type { Project } from "@arc/contracts";
import * as vscode from "vscode";

import type { ProjectClientPort } from "../../infrastructure/backend/ProjectClient.js";
import { createSourceIntelligencePresentation } from "./sourceIntelligencePresentation.js";
import {
  SourceIntelligenceWorkflow,
  type SourceIntelligenceProgress,
  type SourceIntelligenceRun,
  type SourceIntelligenceStage,
} from "./SourceIntelligenceWorkflow.js";
import type { WorkspaceFolderSelector } from "./WorkspaceFolderSelector.js";
import type { WorkspaceProjectStore } from "./WorkspaceProjectStore.js";

export class SourceIntelligenceController implements vscode.Disposable {
  public static readonly commandId = "arc.indexWorkspace";

  private readonly disposables: vscode.Disposable[];
  private readonly indexingProjectIds = new Set<string>();
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly workflow: SourceIntelligenceWorkflow;
  private presentationGeneration = 0;

  public constructor(
    private readonly projectClient: ProjectClientPort,
    private readonly projectStore: WorkspaceProjectStore,
    private readonly folderSelector: WorkspaceFolderSelector,
  ) {
    this.workflow = new SourceIntelligenceWorkflow(projectClient);
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
    this.statusBarItem.name = "Arc Source Intelligence";
    this.statusBarItem.command = SourceIntelligenceController.commandId;
    this.disposables = [
      this.statusBarItem,
      vscode.commands.registerCommand(SourceIntelligenceController.commandId, (folder?: vscode.WorkspaceFolder) =>
        this.execute(folder),
      ),
      vscode.window.onDidChangeActiveTextEditor(() => {
        void this.refresh();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.refresh();
      }),
    ];

    void this.refresh();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  public async refresh(folder = this.folderSelector.preferred()): Promise<void> {
    const generation = ++this.presentationGeneration;
    if (folder === undefined) {
      this.statusBarItem.hide();
      return;
    }
    const project = this.projectStore.get(folder.uri.toString());
    if (project === undefined) {
      this.statusBarItem.hide();
      return;
    }
    if (this.indexingProjectIds.has(project.id)) {
      this.showRunning(project);
      return;
    }

    try {
      const status = await this.projectClient.getSourceIntelligenceStatus(project.id);
      if (generation !== this.presentationGeneration) return;
      this.applyPresentation(createSourceIntelligencePresentation(status));
    } catch {
      if (generation !== this.presentationGeneration) return;
      this.statusBarItem.text = "$(warning) Arc: Index unavailable";
      this.statusBarItem.tooltip = "Arc could not load source intelligence status.";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.statusBarItem.show();
    }
  }

  private async execute(folder?: vscode.WorkspaceFolder): Promise<void> {
    const selectedFolder = folder ?? (await this.folderSelector.select());
    if (selectedFolder === undefined) return;
    if (selectedFolder.uri.scheme !== "file") {
      await vscode.window.showWarningMessage("Arc can only index local workspace folders.");
      return;
    }

    const project = this.projectStore.get(selectedFolder.uri.toString());
    if (project === undefined) {
      const action = await vscode.window.showWarningMessage(
        "Register this workspace with Arc before indexing it.",
        "Register Workspace",
      );
      if (action === "Register Workspace") {
        await vscode.commands.executeCommand("arc.registerWorkspace");
      }
      return;
    }
    if (this.indexingProjectIds.has(project.id)) {
      this.showRunning(project);
      await vscode.window.showInformationMessage(`Arc is already indexing ${project.name}.`);
      return;
    }

    this.indexingProjectIds.add(project.id);
    this.presentationGeneration += 1;
    this.showRunning(project);
    try {
      const result = await vscode.window.withProgress<SourceIntelligenceRun>(
        {
          cancellable: false,
          location: vscode.ProgressLocation.Notification,
          title: `Arc: Indexing ${project.name}`,
        },
        async (progress) =>
          this.workflow.run(project.id, (state) => {
            progress.report({
              increment: state.index === 0 ? 0 : 100 / state.total,
              message: progressMessage(state.stage),
            });
            this.showRunning(project, state);
          }),
      );
      this.indexingProjectIds.delete(project.id);
      await this.refresh(selectedFolder);
      await this.showCompletion(result);
    } catch (error) {
      this.indexingProjectIds.delete(project.id);
      await this.refresh(selectedFolder);
      const message = error instanceof Error ? error.message : "Source intelligence indexing failed.";
      await vscode.window.showErrorMessage(`Arc could not index the workspace. ${message}`);
    }
  }

  private showRunning(project: Project, progress?: SourceIntelligenceProgress): void {
    this.statusBarItem.text = "$(sync~spin) Arc: Indexing";
    this.statusBarItem.tooltip =
      progress === undefined
        ? `Arc is indexing ${project.name}.`
        : `${progressMessage(progress.stage)} (${String(progress.index + 1)} of ${String(progress.total)}).`;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  private applyPresentation(presentation: ReturnType<typeof createSourceIntelligencePresentation>): void {
    this.statusBarItem.text = presentation.text;
    this.statusBarItem.tooltip = presentation.tooltip;
    this.statusBarItem.backgroundColor =
      presentation.background === null
        ? undefined
        : new vscode.ThemeColor(
            presentation.background === "error" ? "statusBarItem.errorBackground" : "statusBarItem.warningBackground",
          );
    this.statusBarItem.show();
  }

  private async showCompletion(result: SourceIntelligenceRun): Promise<void> {
    const summary = `${String(result.symbol.symbolCount)} symbols, ${String(
      result.dependency.edgeCount,
    )} dependency edges, ${String(result.framework.entityCount)} framework entities, and ${String(
      result.embedding.chunkCount,
    )} semantic chunks`;
    if (result.limitedStages.length > 0) {
      await vscode.window.showWarningMessage(
        `Arc indexed ${summary} and reached configured limits in ${result.limitedStages.join(", ")}.`,
      );
      return;
    }
    await vscode.window.showInformationMessage(`Arc indexed ${summary}.`);
  }
}

function progressMessage(stage: SourceIntelligenceStage): string {
  switch (stage) {
    case "inventory":
      return "Scanning repository metadata";
    case "source":
      return "Fingerprinting safe source files";
    case "symbols":
      return "Extracting symbols";
    case "dependencies":
      return "Resolving dependencies";
    case "frameworks":
      return "Understanding framework structure";
    case "embeddings":
      return "Embedding semantic chunks";
  }
}
