import * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { ArcChatViewProvider } from "./features/chat/ArcChatViewProvider.js";
import { InMemoryChatSessionController } from "./features/chat/InMemoryChatSessionController.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();
  const chatSession = new InMemoryChatSessionController();
  const chatViewProvider = new ArcChatViewProvider(context.extensionUri, backendConfig, chatSession);

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
