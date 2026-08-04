import * as vscode from "vscode";

import type { TaskProposal } from "../chat/chatWebview.contract.js";

export interface TaskOutputPort {
  append(proposal: TaskProposal): void;
  show(): void;
}

export class TaskOutputService implements TaskOutputPort, vscode.Disposable {
  private readonly offsets = new Map<string, number>();
  private readonly terminalStatuses = new Map<string, TaskProposal["status"]>();
  private readonly output = vscode.window.createOutputChannel("Arc Tasks");

  public append(proposal: TaskProposal): void {
    const offset = this.offsets.get(proposal.id);
    if (offset === undefined) {
      this.output.appendLine(`$ ${formatCommand(proposal)}`);
    }
    const previousOffset = offset ?? 0;
    const nextOutput = proposal.output.slice(previousOffset);
    if (nextOutput.length > 0) {
      this.output.append(nextOutput);
    }
    this.offsets.set(proposal.id, proposal.output.length);
    if (isTerminal(proposal.status) && this.terminalStatuses.get(proposal.id) !== proposal.status) {
      this.output.appendLine(
        `\n[${proposal.status}${proposal.exitCode === null ? "" : `: ${String(proposal.exitCode)}`}]`,
      );
      this.terminalStatuses.set(proposal.id, proposal.status);
    }
  }

  public show(): void {
    this.output.show(true);
  }

  public dispose(): void {
    this.offsets.clear();
    this.terminalStatuses.clear();
    this.output.dispose();
  }
}

function formatCommand(proposal: TaskProposal): string {
  return [proposal.command.executable, ...proposal.command.args].join(" ");
}

function isTerminal(status: TaskProposal["status"]): boolean {
  return status !== "pending" && status !== "running";
}
