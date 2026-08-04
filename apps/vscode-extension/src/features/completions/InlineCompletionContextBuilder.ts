import * as vscode from "vscode";

import { buildInlineCompletionRequest } from "./inlineCompletionContext.js";

export class InlineCompletionContextBuilder {
  public constructor(
    private readonly limits: { readonly maxPrefixChars: number; readonly maxSuffixChars: number } = {
      maxPrefixChars: 6_000,
      maxSuffixChars: 2_000,
    },
  ) {}

  public build(document: vscode.TextDocument, position: vscode.Position, projectId: string | undefined) {
    const source = document.getText();
    const offset = document.offsetAt(position);
    return buildInlineCompletionRequest({
      language: document.languageId,
      maxTokens: vscode.workspace.getConfiguration("arc").get<number>("inlineCompletions.maxTokens", 128),
      maxPrefixChars: this.limits.maxPrefixChars,
      maxSuffixChars: this.limits.maxSuffixChars,
      offset,
      path: document.uri.scheme === "file" ? vscode.workspace.asRelativePath(document.uri, false) : null,
      projectId: projectId ?? null,
      sourceVersion: document.version,
      source,
    });
  }
}
