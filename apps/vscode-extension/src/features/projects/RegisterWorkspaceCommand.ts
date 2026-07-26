import * as vscode from "vscode";

import type { ProjectClientPort } from "../../infrastructure/backend/ProjectClient.js";
import { ProjectInventoryController } from "./ProjectInventoryController.js";
import type { WorkspaceFolderSelector } from "./WorkspaceFolderSelector.js";
import type { WorkspaceProjectStore } from "./WorkspaceProjectStore.js";

export class RegisterWorkspaceCommand implements vscode.Disposable {
  public static readonly commandId = "arc.registerWorkspace";

  private readonly command: vscode.Disposable;

  public constructor(
    private readonly projectClient: ProjectClientPort,
    private readonly projectStore: WorkspaceProjectStore,
    private readonly folderSelector: WorkspaceFolderSelector,
    private readonly onRegistered: (folder: vscode.WorkspaceFolder) => Promise<void>,
  ) {
    this.command = vscode.commands.registerCommand(RegisterWorkspaceCommand.commandId, () => this.execute());
  }

  public dispose(): void {
    this.command.dispose();
  }

  private async execute(): Promise<void> {
    const folder = await this.folderSelector.select();
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
      await this.projectStore.save(folder.uri.toString(), result.project);
      await this.onRegistered(folder);
      const action = result.created ? "registered" : "reconnected to";
      const nextAction = await vscode.window.showInformationMessage(
        `Arc ${action} ${result.project.name}.`,
        "Scan now",
      );
      if (nextAction === "Scan now") {
        await vscode.commands.executeCommand(ProjectInventoryController.commandId, folder);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workspace registration failed.";
      await vscode.window.showErrorMessage(`Arc could not register the workspace. ${message}`);
    }
  }
}
