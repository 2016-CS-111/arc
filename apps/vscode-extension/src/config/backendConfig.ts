import * as vscode from "vscode";

export interface BackendConfig {
  readonly url: string;
}

export function readBackendConfig(): BackendConfig {
  const config = vscode.workspace.getConfiguration("arc");

  return {
    url: config.get<string>("backendUrl", "http://127.0.0.1:7331"),
  };
}
