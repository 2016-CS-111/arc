import * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { ArcChatViewProvider } from "./features/chat/ArcChatViewProvider.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();
  const chatViewProvider = new ArcChatViewProvider(context.extensionUri, backendConfig);

  context.subscriptions.push(
    chatViewProvider,
    vscode.window.registerWebviewViewProvider(ArcChatViewProvider.viewType, chatViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  registerOpenChatCommand(context);
}

export function deactivate(): void {
  // VSCode calls this when the extension host shuts down.
}
