import type * as vscode from "vscode";

import { readBackendConfig } from "./config/backendConfig.js";
import { registerOpenChatCommand } from "./features/commands/registerOpenChatCommand.js";

export function activate(context: vscode.ExtensionContext): void {
  const backendConfig = readBackendConfig();

  registerOpenChatCommand(context, backendConfig);
}

export function deactivate(): void {
  // VSCode calls this when the extension host shuts down.
}
