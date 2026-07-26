import type { Project } from "@arc/contracts";
import * as vscode from "vscode";

import type { ProjectClientPort } from "../../infrastructure/backend/ProjectClient.js";

interface WorkspaceQuickPickItem extends vscode.QuickPickItem {
  readonly folder: vscode.WorkspaceFolder;
}

type RegisteredProjects = Record<string, Project>;

export class RegisterWorkspaceCommand implements vscode.Disposable {
  public static readonly commandId = "arc.registerWorkspace";
  private static readonly stateKey = "arc.registeredProjects";

  private readonly command: vscode.Disposable;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly projectClient: ProjectClientPort,
  ) {
    this.command = vscode.commands.registerCommand(RegisterWorkspaceCommand.commandId, () => this.execute());
  }

  public dispose(): void {
    this.command.dispose();
  }

  private async execute(): Promise<void> {
    const folder = await this.selectWorkspaceFolder();
    if (folder === undefined) {
      return;
    }

    if (folder.uri.scheme !== "file") {
      await vscode.window.showWarningMessage("Arc can only register local workspace folders.");
      return;
    }

    try {
      const result = await this.projectClient.registerProject({
        name: folder.name,
        rootPath: folder.uri.fsPath,
      });
      await this.rememberProject(folder, result.project);
      const action = result.created ? "registered" : "reconnected to";
      await vscode.window.showInformationMessage(`Arc ${action} ${result.project.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workspace registration failed.";
      await vscode.window.showErrorMessage(`Arc could not register the workspace. ${message}`);
    }
  }

  private async selectWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (folders === undefined || folders.length === 0) {
      await vscode.window.showWarningMessage("Open a local folder before registering it with Arc.");
      return undefined;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor !== undefined) {
      const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (activeFolder !== undefined) {
        return activeFolder;
      }
    }

    if (folders.length === 1) {
      return folders[0];
    }

    const selected = await vscode.window.showQuickPick<WorkspaceQuickPickItem>(
      folders.map((folder) => ({
        description: folder.uri.fsPath,
        folder,
        label: folder.name,
      })),
      { placeHolder: "Select the workspace folder to register with Arc" },
    );

    return selected?.folder;
  }

  private async rememberProject(folder: vscode.WorkspaceFolder, project: Project): Promise<void> {
    const projects = this.context.workspaceState.get<RegisteredProjects>(RegisterWorkspaceCommand.stateKey) ?? {};
    await this.context.workspaceState.update(RegisterWorkspaceCommand.stateKey, {
      ...projects,
      [folder.uri.toString()]: project,
    });
  }
}
