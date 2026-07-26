import * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { ArcChatViewProvider } from "./features/chat/ArcChatViewProvider.js";
import { ChatSessionController } from "./features/chat/ChatSessionController.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";
import { RegisterWorkspaceCommand } from "./features/projects/RegisterWorkspaceCommand.js";
import { ConversationClient } from "./infrastructure/backend/ConversationClient.js";
import { ProjectClient } from "./infrastructure/backend/ProjectClient.js";
import { SocketIoChatTransport } from "./infrastructure/chat/SocketIoChatTransport.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();
  const chatSession = new ChatSessionController({
    conversationClient: new ConversationClient(backendConfig.url),
    transport: new SocketIoChatTransport(backendConfig.url),
  });
  const registerWorkspaceCommand = new RegisterWorkspaceCommand(context, new ProjectClient(backendConfig.url));
  const chatViewProvider = new ArcChatViewProvider(context.extensionUri, backendConfig, chatSession);

  context.subscriptions.push(
    chatSession,
    chatViewProvider,
    registerWorkspaceCommand,
    vscode.window.registerWebviewViewProvider(ArcChatViewProvider.viewType, chatViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  registerOpenChatCommand(context);
}

export function deactivate(): void {
  // VSCode calls this when the extension host shuts down.
}
