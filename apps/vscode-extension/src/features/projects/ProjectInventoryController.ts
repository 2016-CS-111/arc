import type { Project, ProjectScan } from "@arc/contracts";
import * as vscode from "vscode";

import type { ProjectClientPort } from "../../infrastructure/backend/ProjectClient.js";
import { createProjectScanPresentation } from "./projectScanPresentation.js";
import type { WorkspaceFolderSelector } from "./WorkspaceFolderSelector.js";
import type { WorkspaceProjectStore } from "./WorkspaceProjectStore.js";

export class ProjectInventoryController implements vscode.Disposable {
  public static readonly commandId = "arc.scanWorkspace";

  private readonly disposables: vscode.Disposable[];
  private readonly scanningProjectIds = new Set<string>();
  private readonly statusBarItem: vscode.StatusBarItem;
  private presentationGeneration = 0;

  public constructor(
    private readonly projectClient: ProjectClientPort,
    private readonly projectStore: WorkspaceProjectStore,
    private readonly folderSelector: WorkspaceFolderSelector,
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    this.statusBarItem.name = "Arc Repository Inventory";
    this.statusBarItem.command = ProjectInventoryController.commandId;
    this.disposables = [
      this.statusBarItem,
      vscode.commands.registerCommand(ProjectInventoryController.commandId, (folder?: vscode.WorkspaceFolder) =>
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

    if (this.scanningProjectIds.has(project.id)) {
      this.showRunning(project);
      return;
    }

    try {
      const response = await this.projectClient.getLatestScan(project.id);
      if (generation !== this.presentationGeneration) {
        return;
      }
      this.applyPresentation(response.scan);
    } catch {
      if (generation !== this.presentationGeneration) {
        return;
      }
      this.statusBarItem.text = "$(warning) Arc: Scan unavailable";
      this.statusBarItem.tooltip = "Arc could not load repository inventory status.";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.statusBarItem.show();
    }
  }

  private async execute(folder?: vscode.WorkspaceFolder): Promise<void> {
    const selectedFolder = folder ?? (await this.folderSelector.select());
    if (selectedFolder === undefined) {
      return;
    }
    if (selectedFolder.uri.scheme !== "file") {
      await vscode.window.showWarningMessage("Arc can only scan local workspace folders.");
      return;
    }

    const project = this.projectStore.get(selectedFolder.uri.toString());
    if (project === undefined) {
      const action = await vscode.window.showWarningMessage(
        "Register this workspace with Arc before scanning it.",
        "Register Workspace",
      );
      if (action === "Register Workspace") {
        await vscode.commands.executeCommand("arc.registerWorkspace");
      }
      return;
    }

    if (this.scanningProjectIds.has(project.id)) {
      this.showRunning(project);
      await vscode.window.showInformationMessage(`Arc is already scanning ${project.name}.`);
      return;
    }

    this.scanningProjectIds.add(project.id);
    this.presentationGeneration += 1;
    this.showRunning(project);
    try {
      const scan = await vscode.window.withProgress<ProjectScan>(
        {
          cancellable: false,
          location: vscode.ProgressLocation.Notification,
          title: `Arc: Scanning ${project.name}`,
        },
        async (progress) => {
          progress.report({ message: "Reading repository metadata" });
          return this.projectClient.scanProject(project.id);
        },
      );
      this.scanningProjectIds.delete(project.id);
      this.presentationGeneration += 1;
      const presentation = this.applyPresentation(scan);
      if (scan.status === "limited") {
        await vscode.window.showWarningMessage(
          presentation.completionMessage ?? "Arc repository inventory reached configured limits.",
        );
      } else {
        await vscode.window.showInformationMessage(
          presentation.completionMessage ?? "Arc repository inventory completed.",
        );
      }
    } catch (error) {
      this.scanningProjectIds.delete(project.id);
      await this.refresh(selectedFolder);
      const message = error instanceof Error ? error.message : "Repository inventory failed.";
      await vscode.window.showErrorMessage(`Arc could not scan the workspace. ${message}`);
    }
  }

  private showRunning(project: Project): void {
    this.statusBarItem.text = "$(sync~spin) Arc: Scanning";
    this.statusBarItem.tooltip = `Arc is scanning ${project.name}.`;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  private applyPresentation(scan: ProjectScan | null): ReturnType<typeof createProjectScanPresentation> {
    const presentation = createProjectScanPresentation(scan);
    this.statusBarItem.text = presentation.text;
    this.statusBarItem.tooltip = presentation.tooltip;
    this.statusBarItem.backgroundColor =
      presentation.background === null
        ? undefined
        : new vscode.ThemeColor(
            presentation.background === "error" ? "statusBarItem.errorBackground" : "statusBarItem.warningBackground",
          );
    this.statusBarItem.show();
    return presentation;
  }
}
