import { Check, CircleStop, TerminalSquare, X } from "lucide-react";
import type { ReactElement } from "react";

import type { TaskProposal } from "../../../../src/features/chat/chatWebview.contract.js";
import { IconButton } from "../ui/IconButton.js";

export interface TaskProposalPanelProps {
  readonly error: string | undefined;
  readonly onApprove: (proposalId: string) => void;
  readonly onCancel: (proposalId: string) => void;
  readonly onReject: (proposalId: string) => void;
  readonly onShowOutput: (proposalId: string) => void;
  readonly proposal: TaskProposal | undefined;
}

export function TaskProposalPanel({
  error,
  onApprove,
  onCancel,
  onReject,
  onShowOutput,
  proposal,
}: TaskProposalPanelProps): ReactElement | null {
  if (proposal === undefined) {
    return error === undefined ? null : <TaskError message={error} />;
  }

  const pending = proposal.status === "pending";
  const running = proposal.status === "running";
  const command = [proposal.command.executable, ...proposal.command.args].join(" ");

  return (
    <section aria-label="Proposed task" className="border-t border-arc-border bg-arc-surface">
      <header className="flex h-9 items-center justify-between gap-2 border-b border-arc-border px-3">
        <h2 className="m-0 min-w-0 truncate text-xs font-semibold text-arc-foreground" title={proposal.title}>
          {proposal.title}
        </h2>
        <span className="shrink-0 text-xs text-arc-muted">{statusLabel(proposal.status)}</span>
      </header>
      <div className="flex min-w-0 items-center gap-1 px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs text-arc-muted" title={command}>
          {command}
        </code>
        <IconButton
          label="Show Arc task output"
          onClick={() => {
            onShowOutput(proposal.id);
          }}
        >
          <TerminalSquare aria-hidden="true" size={14} strokeWidth={1.8} />
        </IconButton>
      </div>
      {proposal.output.length === 0 ? null : (
        <pre className="m-0 max-h-24 overflow-auto border-t border-arc-border px-3 py-2 text-xs text-arc-muted">
          {proposal.output}
        </pre>
      )}
      {error === undefined ? null : <TaskError message={error} />}
      <footer className="flex min-h-10 items-center justify-end gap-1 border-t border-arc-border px-3 py-1">
        {pending ? (
          <>
            <button
              className="inline-flex h-7 items-center gap-1 rounded border border-arc-border px-2 text-xs text-arc-muted hover:bg-arc-hover hover:text-arc-foreground"
              onClick={() => {
                onReject(proposal.id);
              }}
              type="button"
            >
              <X aria-hidden="true" size={13} strokeWidth={1.8} />
              Reject
            </button>
            <button
              className="inline-flex h-7 items-center gap-1 rounded border border-arc-accent bg-arc-accent px-2 text-xs font-medium text-white hover:opacity-90"
              onClick={() => {
                onApprove(proposal.id);
              }}
              type="button"
            >
              <Check aria-hidden="true" size={13} strokeWidth={1.8} />
              Run
            </button>
          </>
        ) : running ? (
          <button
            className="inline-flex h-7 items-center gap-1 rounded border border-arc-border px-2 text-xs text-arc-muted hover:bg-arc-hover hover:text-arc-foreground"
            onClick={() => {
              onCancel(proposal.id);
            }}
            type="button"
          >
            <CircleStop aria-hidden="true" size={13} strokeWidth={1.8} />
            Stop
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function TaskError({ message }: { readonly message: string }): ReactElement {
  return (
    <p className="m-0 border-t border-arc-border px-3 py-1.5 text-xs text-arc-danger" role="alert">
      {message}
    </p>
  );
}

function statusLabel(status: TaskProposal["status"]): string {
  return status === "pending"
    ? "Approval required"
    : `${status.charAt(0).toUpperCase()}${status.slice(1).replace("_", " ")}`;
}
