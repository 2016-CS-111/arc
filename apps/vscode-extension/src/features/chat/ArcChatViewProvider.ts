import { randomBytes } from "node:crypto";

import type { TaskProposal } from "@arc/contracts";
import * as vscode from "vscode";
import { z } from "zod";

import type { BackendConfig } from "../../config/backendConfig.js";
import { BackendStatusClient } from "../../infrastructure/backend/BackendStatusClient.js";
import type { EditProposalClientPort } from "../../infrastructure/backend/EditProposalClient.js";
import type { TaskProposalClientPort } from "../../infrastructure/backend/TaskProposalClient.js";
import type { MemoryClientPort } from "../../infrastructure/backend/MemoryClient.js";
import type { EditDiffPreviewPort } from "../edits/EditDiffPreviewService.js";
import type { TaskOutputPort } from "../tasks/TaskOutputService.js";
import type { ChatSessionController, ChatSessionEventSubscription } from "./ChatSessionController.js";
import { createWebviewHtml, type WebviewAsset } from "./createWebviewHtml.js";
import { WebviewActionService } from "./WebviewActionService.js";
import {
  type BackendStatusSnapshot,
  type ExtensionToWebviewMessage,
  type MemoryDraft,
  parseWebviewToExtensionMessage,
} from "./chatWebview.contract.js";

const ViteManifestSchema = z.record(
  z.string(),
  z.object({
    file: z.string().min(1),
    isEntry: z.boolean().optional(),
    css: z.array(z.string().min(1)).optional(),
  }),
);

export class ArcChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "arc.chat";

  private currentAbortController: AbortController | undefined;
  private readonly chatSessionSubscription: ChatSessionEventSubscription;
  private readonly webviewActions: WebviewActionService;
  private view: vscode.WebviewView | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly backendConfig: BackendConfig,
    private readonly chatSession: ChatSessionController,
    webviewActions?: WebviewActionService,
    private readonly editProposals?: EditProposalClientPort,
    private readonly editPreview?: EditDiffPreviewPort,
    private readonly taskProposals?: TaskProposalClientPort,
    private readonly taskOutput?: TaskOutputPort,
    private readonly memories?: MemoryClientPort,
    private readonly projectIdProvider?: () => string | undefined,
  ) {
    this.webviewActions =
      webviewActions ??
      new WebviewActionService({
        openExternal: async (url) => vscode.env.openExternal(vscode.Uri.parse(url, true)),
        writeClipboard: (content) => vscode.env.clipboard.writeText(content),
      });
    this.chatSessionSubscription = this.chatSession.subscribe((message) => {
      void this.postChatMessage(message);
    });
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };

    void this.render(view.webview);
    view.onDidDispose(() => {
      this.disposeView();
    });
    view.webview.onDidReceiveMessage((message: unknown) => {
      const parsedMessage = parseWebviewToExtensionMessage(message);
      switch (parsedMessage?.type) {
        case "webview:ready":
          void this.refreshStatus();
          void this.loadMemories();
          this.chatSession.connect();
          void this.chatSession.hydrate();
          return;
        case "status:refresh":
          void this.refreshStatus();
          return;
        case "chat:reconnect":
          this.chatSession.connect();
          return;
        case "chat:submit":
          this.submitChat(parsedMessage.content);
          return;
        case "chat:cancel":
          this.cancelChat();
          return;
        case "conversation:create":
          void this.chatSession.createConversation();
          return;
        case "conversation:select":
          void this.chatSession.selectConversation(parsedMessage.sessionId);
          return;
        case "conversation:rename":
          void this.chatSession.renameConversation(parsedMessage.sessionId, parsedMessage.title);
          return;
        case "conversation:delete":
          void this.chatSession.deleteConversation(parsedMessage.sessionId);
          return;
        case "code:copy":
          void this.webviewActions.copyCode(parsedMessage.content);
          return;
        case "edits:preview":
          void this.previewEdit(parsedMessage.proposalId, parsedMessage.operationId);
          return;
        case "edits:approve":
          void this.approveEdits(parsedMessage.proposalId, parsedMessage.operationIds);
          return;
        case "edits:reject":
          void this.rejectEdits(parsedMessage.proposalId);
          return;
        case "edits:undo":
          void this.undoEdits(parsedMessage.proposalId);
          return;
        case "tasks:approve":
          void this.approveTask(parsedMessage.proposalId);
          return;
        case "tasks:reject":
          void this.rejectTask(parsedMessage.proposalId);
          return;
        case "tasks:cancel":
          void this.cancelTask(parsedMessage.proposalId);
          return;
        case "tasks:show-output":
          this.taskOutput?.show();
          return;
        case "memories:refresh":
          void this.loadMemories();
          return;
        case "memories:create":
          void this.createMemory(parsedMessage.input);
          return;
        case "memories:update":
          void this.updateMemory(parsedMessage.memoryId, parsedMessage.input);
          return;
        case "memories:forget":
          void this.forgetMemory(parsedMessage.memoryId);
          return;
        case "memories:approve":
          void this.approveMemory(parsedMessage.proposalId);
          return;
        case "memories:reject":
          void this.rejectMemory(parsedMessage.proposalId);
          return;
        case "memories:export":
          void this.exportMemories();
          return;
        case "memories:import":
          void this.importMemories(parsedMessage.records);
          return;
        case "link:open":
          void this.webviewActions.openExternalUrl(parsedMessage.url);
          return;
        default:
          return;
      }
    });
  }

  public dispose(): void {
    this.disposeView();
    this.chatSessionSubscription.dispose();
  }

  private async render(webview: vscode.Webview): Promise<void> {
    try {
      const assets = await this.getAssets(webview);
      webview.html = createWebviewHtml(webview.cspSource, createNonce(), assets);
    } catch {
      webview.html = createWebviewHtml(webview.cspSource, createNonce(), {
        scriptUri: "",
        styleUri: "",
      });
    }
  }

  private async getAssets(webview: vscode.Webview): Promise<WebviewAsset> {
    const manifestUri = vscode.Uri.joinPath(this.extensionUri, "dist", "webview", ".vite", "manifest.json");
    const content = await vscode.workspace.fs.readFile(manifestUri);
    const manifestJson: unknown = JSON.parse(Buffer.from(content).toString("utf8"));
    const manifest = ViteManifestSchema.parse(manifestJson);
    const entry = Object.values(manifest).find((candidate) => candidate.isEntry);
    const stylesheet = entry?.css?.[0];

    if (entry === undefined || stylesheet === undefined) {
      throw new Error("Arc webview assets are unavailable.");
    }

    return {
      scriptUri: webview.asWebviewUri(this.assetUri(entry.file)).toString(),
      styleUri: webview.asWebviewUri(this.assetUri(stylesheet)).toString(),
    };
  }

  private assetUri(assetPath: string): vscode.Uri {
    return vscode.Uri.joinPath(this.extensionUri, "dist", "webview", ...assetPath.split("/"));
  }

  private async refreshStatus(): Promise<void> {
    this.currentAbortController?.abort();
    const abortController = new AbortController();
    this.currentAbortController = abortController;

    const status = await new BackendStatusClient(this.backendConfig.url).getStatus(abortController.signal);
    if (abortController.signal.aborted || this.view === undefined) {
      return;
    }

    const snapshot: BackendStatusSnapshot = {
      backend: status.backend,
      backendUrl: this.backendConfig.url,
      checkedAt: new Date().toISOString(),
      ollama: status.ollama,
      ...(status.error === undefined ? {} : { error: status.error }),
    };
    await this.view.webview.postMessage({ snapshot, type: "status:update" });
  }

  private submitChat(content: string): void {
    this.chatSession.submit(content);
  }

  private cancelChat(): void {
    this.chatSession.cancelActiveGeneration();
  }

  private async previewEdit(proposalId: string, operationId: string): Promise<void> {
    if (this.editProposals === undefined || this.editPreview === undefined) {
      return;
    }
    try {
      await this.editPreview.show(await this.editProposals.get(proposalId), operationId);
    } catch (error) {
      await this.postEditError(error);
    }
  }

  private async approveEdits(proposalId: string, operationIds: readonly string[]): Promise<void> {
    if (this.editProposals === undefined) {
      return;
    }
    try {
      const proposal = await this.editProposals.get(proposalId);
      if (this.editPreview?.hasDirtyDocuments(proposal) === true) {
        await this.postEditError("Save or revert the affected open files before applying Arc edits.");
        return;
      }
      await this.postChatMessage({
        proposal: await this.editProposals.approve(proposalId, { operationIds: Array.from(operationIds) }),
        type: "edits:updated",
      });
    } catch (error) {
      await this.postEditError(error);
    }
  }

  private async rejectEdits(proposalId: string): Promise<void> {
    if (this.editProposals === undefined) {
      return;
    }
    try {
      await this.postChatMessage({ proposal: await this.editProposals.reject(proposalId), type: "edits:updated" });
    } catch (error) {
      await this.postEditError(error);
    }
  }

  private async undoEdits(proposalId: string): Promise<void> {
    if (this.editProposals === undefined) {
      return;
    }
    try {
      await this.postChatMessage({ proposal: await this.editProposals.undo(proposalId), type: "edits:updated" });
    } catch (error) {
      await this.postEditError(error);
    }
  }

  private async approveTask(proposalId: string): Promise<void> {
    if (this.taskProposals === undefined) {
      return;
    }
    try {
      const proposal = await this.taskProposals.get(proposalId);
      if (!(await confirmTaskApproval(proposal))) return;
      await this.postChatMessage({ proposal: await this.taskProposals.approve(proposalId), type: "tasks:updated" });
    } catch (error) {
      await this.postTaskError(error);
    }
  }

  private async rejectTask(proposalId: string): Promise<void> {
    if (this.taskProposals === undefined) {
      return;
    }
    try {
      await this.postChatMessage({ proposal: await this.taskProposals.reject(proposalId), type: "tasks:updated" });
    } catch (error) {
      await this.postTaskError(error);
    }
  }

  private async cancelTask(proposalId: string): Promise<void> {
    if (this.taskProposals === undefined) {
      return;
    }
    try {
      await this.postChatMessage({ proposal: await this.taskProposals.cancel(proposalId), type: "tasks:updated" });
    } catch (error) {
      await this.postTaskError(error);
    }
  }

  private async postChatMessage(message: ExtensionToWebviewMessage): Promise<void> {
    if (message.type === "tasks:updated") {
      this.taskOutput?.append(message.proposal);
    }
    if (this.view === undefined) {
      return;
    }

    await this.view.webview.postMessage(message);
  }

  private async postEditError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Arc could not update the edit proposal.";
    await this.postChatMessage({ message, type: "edits:error" });
  }

  private async postTaskError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Arc could not update the task proposal.";
    await this.postChatMessage({ message, type: "tasks:error" });
  }

  private async loadMemories(): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      await this.postChatMessage({
        records: [...(await this.memories.list(this.projectIdProvider?.(), true))],
        type: "memories:updated",
      });
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async createMemory(input: MemoryDraft): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      const projectId = this.projectIdProvider?.();
      const request = input.scope === "project" && projectId !== undefined ? { ...input, projectId } : input;
      await this.memories.create(request);
      await this.loadMemories();
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async updateMemory(memoryId: string, input: Parameters<MemoryClientPort["update"]>[1]): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      await this.memories.update(memoryId, input);
      await this.loadMemories();
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async forgetMemory(memoryId: string): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      await this.memories.forget(memoryId);
      await this.loadMemories();
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async approveMemory(proposalId: string): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      await this.memories.approveProposal(proposalId);
      await this.loadMemories();
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async rejectMemory(proposalId: string): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      await this.postChatMessage({
        proposal: await this.memories.rejectProposal(proposalId),
        type: "memories:proposal",
      });
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async exportMemories(): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      const value = await this.memories.export(this.projectIdProvider?.());
      await this.webviewActions.copyCode(JSON.stringify(value, undefined, 2));
      await this.postChatMessage({ type: "memories:exported", value });
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async importMemories(records: readonly MemoryDraft[]): Promise<void> {
    if (this.memories === undefined) {
      return;
    }
    try {
      await this.memories.import(records);
      await this.loadMemories();
    } catch (error) {
      await this.postMemoryError(error);
    }
  }

  private async postMemoryError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Arc could not update memories.";
    await this.postChatMessage({ message, type: "memories:error" });
  }

  private disposeView(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = undefined;
    this.view = undefined;
  }
}

function createNonce(): string {
  return randomBytes(16).toString("base64");
}

function confirmTaskApproval(proposal: TaskProposal): Thenable<boolean> {
  if (proposal.approval.kind === "standard") return Promise.resolve(true);
  const label = proposal.approval.kind.replace(/_/gu, " ");
  return vscode.window
    .showWarningMessage(`Confirm ${label}: ${proposal.title}?`, "Run", "Cancel")
    .then((choice) => choice === "Run");
}
