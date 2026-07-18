import { randomBytes } from "node:crypto";

import * as vscode from "vscode";
import { z } from "zod";

import type { BackendConfig } from "../../config/backendConfig.js";
import { BackendStatusClient } from "../../infrastructure/backend/BackendStatusClient.js";
import type { InMemoryChatSessionController } from "./InMemoryChatSessionController.js";
import { createWebviewHtml, type WebviewAsset } from "./createWebviewHtml.js";
import {
  type BackendStatusSnapshot,
  type ExtensionToWebviewMessage,
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
  private view: vscode.WebviewView | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly backendConfig: BackendConfig,
    private readonly chatSession: InMemoryChatSessionController,
  ) {}

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
          void this.hydrateChat();
          return;
        case "status:refresh":
          void this.refreshStatus();
          return;
        case "chat:submit":
          void this.submitChat(parsedMessage.content);
          return;
        case "chat:cancel":
          void this.cancelChat();
          return;
        default:
          return;
      }
    });
  }

  public dispose(): void {
    this.disposeView();
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

  private async hydrateChat(): Promise<void> {
    await this.postChatMessage({
      session: this.chatSession.getSnapshot(),
      type: "chat:hydrated",
    });
  }

  private async submitChat(content: string): Promise<void> {
    const submission = this.chatSession.submit(content);
    if (submission === undefined) {
      return;
    }

    await this.postChatMessage({
      session: submission.session,
      type: "chat:submitted",
    });
  }

  private async cancelChat(): Promise<void> {
    const activeGeneration = this.chatSession.getSnapshot().activeGeneration;
    if (activeGeneration === null) {
      return;
    }

    if (this.chatSession.cancel(activeGeneration.requestId) !== undefined) {
      await this.postChatMessage({
        requestId: activeGeneration.requestId,
        type: "chat:generation-cancelled",
      });
    }
  }

  private async postChatMessage(message: ExtensionToWebviewMessage): Promise<void> {
    if (this.view === undefined) {
      return;
    }

    await this.view.webview.postMessage(message);
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
