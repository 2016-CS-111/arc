import * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { ArcChatViewProvider } from "./features/chat/ArcChatViewProvider.js";
import { ChatSessionController } from "./features/chat/ChatSessionController.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";
import { SocketIoChatTransport } from "./infrastructure/chat/SocketIoChatTransport.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();
  const chatSession = new ChatSessionController({
    transport: new SocketIoChatTransport(backendConfig.url),
  });
  const chatViewProvider = new ArcChatViewProvider(context.extensionUri, backendConfig, chatSession);

  context.subscriptions.push(
    chatSession,
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
