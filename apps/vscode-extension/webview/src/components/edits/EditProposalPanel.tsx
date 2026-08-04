import { Check, Eye, RotateCcw, X } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";

import type { EditProposal } from "../../../../src/features/chat/chatWebview.contract.js";
import { IconButton } from "../ui/IconButton.js";

export interface EditProposalPanelProps {
  readonly error: string | undefined;
  readonly onApprove: (proposalId: string, operationIds: readonly string[]) => void;
  readonly onPreview: (proposalId: string, operationId: string) => void;
  readonly onReject: (proposalId: string) => void;
  readonly onUndo: (proposalId: string) => void;
  readonly proposal: EditProposal | undefined;
}

export function EditProposalPanel({
  error,
  onApprove,
  onPreview,
  onReject,
  onUndo,
  proposal,
}: EditProposalPanelProps): ReactElement | null {
  const [selectedOperationIds, setSelectedOperationIds] = useState<readonly string[]>([]);

  useEffect(() => {
    setSelectedOperationIds(proposal?.status === "pending" ? proposal.operations.map((operation) => operation.id) : []);
  }, [proposal]);

  if (proposal === undefined) {
    return error === undefined ? null : <EditError message={error} />;
  }

  const pending = proposal.status === "pending";
  const selected = new Set(selectedOperationIds);

  function toggle(operationId: string): void {
    setSelectedOperationIds((current) =>
      current.includes(operationId) ? current.filter((id) => id !== operationId) : [...current, operationId],
    );
  }

  return (
    <section aria-label="Proposed edits" className="border-t border-arc-border bg-arc-surface">
      <header className="flex h-9 items-center justify-between gap-2 border-b border-arc-border px-3">
        <h2 className="m-0 text-xs font-semibold text-arc-foreground">Proposed edits</h2>
        <span className="text-xs text-arc-muted">{statusLabel(proposal.status)}</span>
      </header>
      <div className="max-h-36 overflow-y-auto px-3 py-1">
        {proposal.operations.map((operation) => (
          <div className="flex min-w-0 items-center gap-1 py-1" key={operation.id}>
            {pending ? (
              <input
                aria-label={`Select ${operationLabel(operation)}`}
                checked={selected.has(operation.id)}
                className="size-3.5 shrink-0 accent-arc-accent"
                onChange={() => {
                  toggle(operation.id);
                }}
                type="checkbox"
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-xs" title={operationLabel(operation)}>
              <span className="text-arc-muted">{operation.type}</span> {operationLabel(operation)}
            </span>
            <IconButton
              label={`Preview ${operationLabel(operation)}`}
              onClick={() => {
                onPreview(proposal.id, operation.id);
              }}
            >
              <Eye aria-hidden="true" size={14} strokeWidth={1.8} />
            </IconButton>
          </div>
        ))}
      </div>
      {error === undefined ? null : <EditError message={error} />}
      <footer className="flex min-h-10 items-center justify-end gap-1 border-t border-arc-border px-3 py-1">
        {pending ? (
          <>
            <button
              className="inline-flex h-7 items-center gap-1 rounded border border-arc-border px-2 text-xs text-arc-muted hover:bg-arc-hover hover:text-arc-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                onReject(proposal.id);
              }}
              type="button"
            >
              <X aria-hidden="true" size={13} strokeWidth={1.8} />
              Reject
            </button>
            <button
              className="inline-flex h-7 items-center gap-1 rounded border border-arc-accent bg-arc-accent px-2 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={selectedOperationIds.length === 0}
              onClick={() => {
                onApprove(proposal.id, selectedOperationIds);
              }}
              type="button"
            >
              <Check aria-hidden="true" size={13} strokeWidth={1.8} />
              Apply {selectedOperationIds.length}
            </button>
          </>
        ) : proposal.status === "applied" ? (
          <button
            className="inline-flex h-7 items-center gap-1 rounded border border-arc-border px-2 text-xs text-arc-muted hover:bg-arc-hover hover:text-arc-foreground"
            onClick={() => {
              onUndo(proposal.id);
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} strokeWidth={1.8} />
            Undo
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function EditError({ message }: { readonly message: string }): ReactElement {
  return (
    <p className="m-0 border-t border-arc-border px-3 py-1.5 text-xs text-arc-danger" role="alert">
      {message}
    </p>
  );
}

function operationLabel(operation: EditProposal["operations"][number]): string {
  return operation.fromPath === undefined ? operation.path : `${operation.fromPath} -> ${operation.path}`;
}

function statusLabel(status: EditProposal["status"]): string {
  return status === "pending" ? "Review required" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
