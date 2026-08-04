import * as vscode from "vscode";

import type { EditProposal } from "../chat/chatWebview.contract.js";

export interface EditDiffPreviewPort {
  hasDirtyDocuments(proposal: EditProposal): boolean;
  show(proposal: EditProposal, operationId: string): Promise<void>;
}

export class EditDiffPreviewService implements EditDiffPreviewPort, vscode.Disposable {
  private readonly content = new Map<string, string>();
  private readonly registration: vscode.Disposable;

  public constructor() {
    this.registration = vscode.workspace.registerTextDocumentContentProvider("arc-edit", {
      provideTextDocumentContent: (uri) => this.content.get(uri.toString()) ?? "",
    });
  }

  public hasDirtyDocuments(proposal: EditProposal): boolean {
    return proposal.operations.some((operation) => {
      const paths = operation.fromPath === undefined ? [operation.path] : [operation.fromPath, operation.path];
      return paths.some((path) => this.isDirty(proposal.rootPath, path));
    });
  }

  public async show(proposal: EditProposal, operationId: string): Promise<void> {
    const operation = proposal.operations.find((candidate) => candidate.id === operationId);
    if (operation === undefined) {
      return;
    }
    const before = this.virtualDocument(proposal.id, operation.id, "before", operation.before ?? "");
    const after = this.virtualDocument(proposal.id, operation.id, "after", operation.after ?? "");
    const sourcePath = operation.fromPath ?? operation.path;
    const title = `${operation.type}: ${sourcePath}${operation.type === "move" ? ` -> ${operation.path}` : ""}`;
    await vscode.commands.executeCommand("vscode.diff", before, after, title, { preview: true });
  }

  public dispose(): void {
    this.content.clear();
    this.registration.dispose();
  }

  private virtualDocument(
    proposalId: string,
    operationId: string,
    side: "before" | "after",
    content: string,
  ): vscode.Uri {
    const uri = vscode.Uri.from({
      path: `/${proposalId}/${operationId}/${side}`,
      scheme: "arc-edit",
    });
    this.content.set(uri.toString(), content);
    return uri;
  }

  private isDirty(rootPath: string, relativePath: string): boolean {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(rootPath), ...relativePath.split("/"));
    return vscode.workspace.textDocuments.some((document) => document.isDirty && document.uri.fsPath === uri.fsPath);
  }
}
