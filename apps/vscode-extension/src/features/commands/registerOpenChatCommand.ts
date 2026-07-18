import * as vscode from "vscode";

export function registerOpenChatCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("arc.openChat", async () => {
    await vscode.commands.executeCommand("workbench.view.extension.arc");
    await vscode.commands.executeCommand("arc.chat.focus");
  });

  context.subscriptions.push(disposable);
}
