import type { HealthResponse } from "@arc/contracts";
import * as vscode from "vscode";

import type { BackendConfig } from "../../config/backendConfig.js";

export function registerOpenChatCommand(
  context: vscode.ExtensionContext,
  backendConfig: BackendConfig,
): void {
  const disposable = vscode.commands.registerCommand("arc.openChat", async () => {
    const expectedHealthShape: Pick<HealthResponse, "service" | "status"> = {
      service: "arc-ai-server",
      status: "ok",
    };

    await vscode.window.showInformationMessage(
      `Arc backend: ${backendConfig.url} (${expectedHealthShape.service})`,
    );
  });

  context.subscriptions.push(disposable);
}
