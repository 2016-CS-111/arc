import * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { ArcChatViewProvider } from "./features/chat/ArcChatViewProvider.js";
import { ChatSessionController } from "./features/chat/ChatSessionController.js";
import { ArcInlineCompletionProvider } from "./features/completions/ArcInlineCompletionProvider.js";
import { ArcCodeActionProvider } from "./features/actions/ArcCodeActionProvider.js";
import {
  ArcGuidedCodeActionController,
  type GuidedCodeActionCommand,
} from "./features/actions/ArcGuidedCodeActionController.js";
import { EditDiffPreviewService } from "./features/edits/EditDiffPreviewService.js";
import { TaskPlanDocumentController } from "./features/tasks/TaskPlanDocumentController.js";
import { TaskRunController } from "./features/tasks/TaskRunController.js";
import { TaskOutputService } from "./features/tasks/TaskOutputService.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";
import { ProjectInventoryController } from "./features/projects/ProjectInventoryController.js";
import { RegisterWorkspaceCommand } from "./features/projects/RegisterWorkspaceCommand.js";
import { SourceIntelligenceController } from "./features/projects/SourceIntelligenceController.js";
import { WorkspaceFolderSelector } from "./features/projects/WorkspaceFolderSelector.js";
import { WorkspaceProjectStore } from "./features/projects/WorkspaceProjectStore.js";
import { ConversationClient } from "./infrastructure/backend/ConversationClient.js";
import { AgentPlanClient } from "./infrastructure/backend/AgentPlanClient.js";
import { AgentRunClient } from "./infrastructure/backend/AgentRunClient.js";
import { EditProposalClient } from "./infrastructure/backend/EditProposalClient.js";
import { GuidedCodeActionClient } from "./infrastructure/backend/GuidedCodeActionClient.js";
import { ProjectClient } from "./infrastructure/backend/ProjectClient.js";
import { TaskProposalClient } from "./infrastructure/backend/TaskProposalClient.js";
import { MemoryClient } from "./infrastructure/backend/MemoryClient.js";
import { CompletionClient } from "./infrastructure/backend/CompletionClient.js";
import { SocketIoChatTransport } from "./infrastructure/chat/SocketIoChatTransport.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();
  const projectClient = new ProjectClient(backendConfig.url);
  const editProposalClient = new EditProposalClient(backendConfig.url);
  const taskProposalClient = new TaskProposalClient(backendConfig.url);
  const memoryClient = new MemoryClient(backendConfig.url);
  const editPreview = new EditDiffPreviewService();
  const taskOutput = new TaskOutputService();
  const projectStore = new WorkspaceProjectStore(context.workspaceState);
  const folderSelector = new WorkspaceFolderSelector();
  const projectIdProvider = (): string | undefined => {
    const folder = folderSelector.preferred();
    return folder === undefined ? undefined : projectStore.get(folder.uri.toString())?.id;
  };
  const chatSession = new ChatSessionController({
    conversationClient: new ConversationClient(backendConfig.url),
    projectIdProvider,
    transport: new SocketIoChatTransport(backendConfig.url),
  });
  const inlineCompletionProvider = new ArcInlineCompletionProvider(
    new CompletionClient(backendConfig.url),
    projectIdProvider,
  );
  const guidedCodeActions = new ArcGuidedCodeActionController(
    new GuidedCodeActionClient(backendConfig.url),
    editProposalClient,
    editPreview,
    taskProposalClient,
    taskOutput,
    projectIdProvider,
  );
  const taskPlans = new TaskPlanDocumentController(new AgentPlanClient(backendConfig.url), projectIdProvider);
  const taskRuns = new TaskRunController(new AgentRunClient(backendConfig.url));
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
    memoryClient,
    projectIdProvider,
  );

  context.subscriptions.push(
    chatSession,
    editPreview,
    taskOutput,
    chatViewProvider,
    projectInventoryController,
    registerWorkspaceCommand,
    sourceIntelligenceController,
    inlineCompletionProvider,
    guidedCodeActions,
    taskPlans,
    taskRuns,
    vscode.languages.registerInlineCompletionItemProvider({ scheme: "file" }, inlineCompletionProvider),
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, new ArcCodeActionProvider(), {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Refactor,
        vscode.CodeActionKind.RefactorExtract,
        vscode.CodeActionKind.RefactorRewrite,
      ],
    }),
    vscode.commands.registerCommand(ArcGuidedCodeActionController.command, (command: GuidedCodeActionCommand) =>
      guidedCodeActions.execute(command),
    ),
    vscode.commands.registerCommand(TaskPlanDocumentController.planCommand, () => taskPlans.plan()),
    vscode.commands.registerCommand(TaskPlanDocumentController.saveCommand, () => taskPlans.saveActivePlan()),
    vscode.commands.registerCommand(TaskRunController.startCommand, () => taskRuns.start()),
    vscode.commands.registerCommand(TaskRunController.resumeCommand, () => taskRuns.resume()),
    vscode.commands.registerCommand(TaskRunController.pauseCommand, () => taskRuns.pause()),
    vscode.commands.registerCommand(TaskRunController.cancelCommand, () => taskRuns.cancel()),
    vscode.window.registerWebviewViewProvider(ArcChatViewProvider.viewType, chatViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  registerOpenChatCommand(context);
}

export function deactivate(): void {
  // VSCode calls this when the extension host shuts down.
}
