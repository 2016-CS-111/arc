import * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { ArcChatViewProvider } from "./features/chat/ArcChatViewProvider.js";
import { ChatSessionController } from "./features/chat/ChatSessionController.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";
import { ProjectInventoryController } from "./features/projects/ProjectInventoryController.js";
import { RegisterWorkspaceCommand } from "./features/projects/RegisterWorkspaceCommand.js";
import { SourceIntelligenceController } from "./features/projects/SourceIntelligenceController.js";
import { WorkspaceFolderSelector } from "./features/projects/WorkspaceFolderSelector.js";
import { WorkspaceProjectStore } from "./features/projects/WorkspaceProjectStore.js";
import { ConversationClient } from "./infrastructure/backend/ConversationClient.js";
import { ProjectClient } from "./infrastructure/backend/ProjectClient.js";
import { SocketIoChatTransport } from "./infrastructure/chat/SocketIoChatTransport.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();
  const chatSession = new ChatSessionController({
    conversationClient: new ConversationClient(backendConfig.url),
    transport: new SocketIoChatTransport(backendConfig.url),
  });
  const projectClient = new ProjectClient(backendConfig.url);
  const projectStore = new WorkspaceProjectStore(context.workspaceState);
  const folderSelector = new WorkspaceFolderSelector();
  const projectInventoryController = new ProjectInventoryController(projectClient, projectStore, folderSelector);
  const sourceIntelligenceController = new SourceIntelligenceController(projectClient, projectStore, folderSelector);
  const registerWorkspaceCommand = new RegisterWorkspaceCommand(projectClient, projectStore, folderSelector, (folder) =>
    Promise.all([projectInventoryController.refresh(folder), sourceIntelligenceController.refresh(folder)]).then(
      () => undefined,
    ),
  );
  const chatViewProvider = new ArcChatViewProvider(context.extensionUri, backendConfig, chatSession);

  context.subscriptions.push(
    chatSession,
    chatViewProvider,
    projectInventoryController,
    registerWorkspaceCommand,
    sourceIntelligenceController,
    vscode.window.registerWebviewViewProvider(ArcChatViewProvider.viewType, chatViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  registerOpenChatCommand(context);
}

export function deactivate(): void {
  // VSCode calls this when the extension host shuts down.
}
