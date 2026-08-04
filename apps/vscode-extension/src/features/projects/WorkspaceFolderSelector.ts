import * as vscode from "vscode";

interface WorkspaceQuickPickItem extends vscode.QuickPickItem {
  readonly folder: vscode.WorkspaceFolder;
}

export class WorkspaceFolderSelector {
  public preferred(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders === undefined || folders.length === 0) {
      return undefined;
    }

    return this.active() ?? folders[0];
  }

  public async select(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (folders === undefined || folders.length === 0) {
      await vscode.window.showWarningMessage("Open a local folder before using Arc project commands.");
      return undefined;
    }

    const activeFolder = this.active();
    if (activeFolder !== undefined) {
      return activeFolder;
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
      { placeHolder: "Select the workspace folder to use with Arc" },
    );

    return selected?.folder;
  }

  private active(): vscode.WorkspaceFolder | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    return activeEditor === undefined ? undefined : vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
  }
}
