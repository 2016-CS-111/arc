import type { GuidedCodeActionKind } from "@arc/contracts";
import * as vscode from "vscode";

import { ArcGuidedCodeActionController, type GuidedCodeActionCommand } from "./ArcGuidedCodeActionController.js";

export class ArcCodeActionProvider implements vscode.CodeActionProvider {
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (document.uri.scheme !== "file") return [];

    const actions = [
      this.create("Explain code", "explain", vscode.CodeActionKind.Refactor, document, range),
      this.create("Add documentation", "add_documentation", vscode.CodeActionKind.Refactor, document, range),
      this.create("Add tests", "add_tests", vscode.CodeActionKind.Refactor, document, range),
    ];
    if (!range.isEmpty) {
      actions.push(
        this.create("Simplify selection", "simplify", vscode.CodeActionKind.Refactor, document, range),
        this.create("Extract function", "extract_function", vscode.CodeActionKind.RefactorExtract, document, range),
        this.create("Rename symbol", "rename_symbol", vscode.CodeActionKind.RefactorRewrite, document, range),
      );
    }
    for (const diagnostic of context.diagnostics) {
      actions.push(
        this.create(
          "Fix diagnostic",
          "fix_diagnostic",
          vscode.CodeActionKind.QuickFix,
          document,
          diagnostic.range,
          diagnostic,
        ),
      );
    }
    return actions;
  }

  private create(
    label: string,
    action: GuidedCodeActionKind,
    kind: vscode.CodeActionKind,
    document: vscode.TextDocument,
    range: vscode.Range,
    diagnostic?: vscode.Diagnostic,
  ): vscode.CodeAction {
    const codeAction = new vscode.CodeAction(`Arc: ${label}`, kind);
    if (diagnostic !== undefined) codeAction.diagnostics = [diagnostic];
    const command: GuidedCodeActionCommand = {
      action,
      range: { end: range.end, start: range.start },
      sourceVersion: document.version,
      uri: document.uri.toString(),
      ...(diagnostic === undefined ? {} : { diagnostic: diagnostic.message }),
    };
    codeAction.command = {
      arguments: [command],
      command: ArcGuidedCodeActionController.command,
      title: `Arc: ${label}`,
    };
    return codeAction;
  }
}
