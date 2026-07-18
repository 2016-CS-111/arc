import { randomBytes } from "node:crypto";

import * as vscode from "vscode";
import { z } from "zod";

import type { BackendConfig } from "../../config/backendConfig.js";
import { BackendStatusClient } from "../../infrastructure/backend/BackendStatusClient.js";
import { createWebviewHtml, type WebviewAsset } from "./createWebviewHtml.js";
import {
  type BackendStatusSnapshot,
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
      if (parsedMessage?.type === "webview:ready" || parsedMessage?.type === "status:refresh") {
        void this.refreshStatus();
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
    const manifestUri = vscode.Uri.joinPath(
      this.extensionUri,
      "dist",
      "webview",
      ".vite",
      "manifest.json",
    );
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

    const status = await new BackendStatusClient(this.backendConfig.url).getStatus(
      abortController.signal,
    );
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

  private disposeView(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = undefined;
    this.view = undefined;
  }
}

function createNonce(): string {
  return randomBytes(16).toString("base64");
}
