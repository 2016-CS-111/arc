import type { WebviewToExtensionMessage } from "../../src/features/chat/chatWebview.contract.js";

interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

function getVsCodeApi(): VsCodeApi | undefined {
  return typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
}

const vscode = getVsCodeApi();

export function postToExtension(message: WebviewToExtensionMessage): void {
  vscode?.postMessage(message);
}
