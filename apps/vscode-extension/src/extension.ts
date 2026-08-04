import * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { ArcChatViewProvider } from "./features/chat/ArcChatViewProvider.js";
import { ChatSessionController } from "./features/chat/ChatSessionController.js";
import { EditDiffPreviewService } from "./features/edits/EditDiffPreviewService.js";
import { TaskOutputService } from "./features/tasks/TaskOutputService.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";
import { ProjectInventoryController } from "./features/projects/ProjectInventoryController.js";
import { RegisterWorkspaceCommand } from "./features/projects/RegisterWorkspaceCommand.js";
import { SourceIntelligenceController } from "./features/projects/SourceIntelligenceController.js";
import { WorkspaceFolderSelector } from "./features/projects/WorkspaceFolderSelector.js";
import { WorkspaceProjectStore } from "./features/projects/WorkspaceProjectStore.js";
import { ConversationClient } from "./infrastructure/backend/ConversationClient.js";
import { EditProposalClient } from "./infrastructure/backend/EditProposalClient.js";
import { ProjectClient } from "./infrastructure/backend/ProjectClient.js";
import { TaskProposalClient } from "./infrastructure/backend/TaskProposalClient.js";
import { SocketIoChatTransport } from "./infrastructure/chat/SocketIoChatTransport.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();
  const projectClient = new ProjectClient(backendConfig.url);
  const editProposalClient = new EditProposalClient(backendConfig.url);
  const taskProposalClient = new TaskProposalClient(backendConfig.url);
  const editPreview = new EditDiffPreviewService();
  const taskOutput = new TaskOutputService();
  const projectStore = new WorkspaceProjectStore(context.workspaceState);
  const folderSelector = new WorkspaceFolderSelector();
  const chatSession = new ChatSessionController({
    conversationClient: new ConversationClient(backendConfig.url),
    projectIdProvider: () => {
      const folder = folderSelector.preferred();
      return folder === undefined ? undefined : projectStore.get(folder.uri.toString())?.id;
    },
    transport: new SocketIoChatTransport(backendConfig.url),
  });
  const projectInventoryController = new ProjectInventoryController(projectClient, projectStore, folderSelector);
  const sourceIntelligenceController = new SourceIntelligenceController(projectClient, projectStore, folderSelector);
  const registerWorkspaceCommand = new RegisterWorkspaceCommand(projectClient, projectStore, folderSelector, (folder) =>
    Promise.all([projectInventoryController.refresh(folder), sourceIntelligenceController.refresh(folder)]).then(
      () => undefined,
    ),
  );
  const chatViewProvider = new ArcChatViewProvider(
    context.extensionUri,
    backendConfig,
    chatSession,
    undefined,
    editProposalClient,
    editPreview,
    taskProposalClient,
    taskOutput,
  );

  context.subscriptions.push(
    chatSession,
    editPreview,
    taskOutput,
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
