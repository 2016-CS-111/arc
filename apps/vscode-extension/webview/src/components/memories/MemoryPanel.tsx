import { Check, Download, Pencil, Pin, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { type ReactElement, type SyntheticEvent, useState } from "react";

import type { MemoryDraft, MemoryProposal, MemoryRecord } from "../../../../src/features/chat/chatWebview.contract.js";
import { IconButton } from "../ui/IconButton.js";

export interface MemoryPanelProps {
  readonly error: string | undefined;
  readonly onApprove: (proposalId: string) => void;
  readonly onCreate: (input: MemoryDraft) => void;
  readonly onExport: () => void;
  readonly onForget: (memoryId: string) => void;
  readonly onImport: (value: string) => void;
  readonly onRefresh: () => void;
  readonly onReject: (proposalId: string) => void;
  readonly onUpdate: (memoryId: string, input: { readonly content?: string; readonly pinned?: boolean }) => void;
  readonly proposal: MemoryProposal | undefined;
  readonly records: readonly MemoryRecord[];
  readonly visible: boolean;
}

export function MemoryPanel({
  error,
  onApprove,
  onCreate,
  onExport,
  onForget,
  onImport,
  onRefresh,
  onReject,
  onUpdate,
  proposal,
  records,
  visible,
}: MemoryPanelProps): ReactElement | null {
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MemoryDraft["kind"]>("convention");
  const [scope, setScope] = useState<MemoryDraft["scope"]>("project");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [importValue, setImportValue] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [editingContent, setEditingContent] = useState("");

  if (!visible) {
    return null;
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalizedContent = content.trim();
    if (normalizedContent.length === 0) {
      return;
    }
    onCreate({
      content: normalizedContent,
      ...(expiresAt.length === 0 ? {} : { expiresAt: new Date(expiresAt).toISOString() }),
      kind,
      pinned,
      scope,
    });
    setContent("");
    setPinned(false);
    setExpiresAt("");
  }

  return (
    <section aria-label="Arc memory" className="max-h-80 overflow-y-auto border-t border-arc-border bg-arc-surface">
      <header className="flex h-9 items-center justify-between border-b border-arc-border px-3">
        <h2 className="m-0 text-xs font-semibold">Memory</h2>
        <div className="flex items-center gap-1">
          <IconButton label="Refresh memories" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Copy memory export" onClick={onExport}>
            <Download aria-hidden="true" size={14} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Import memories"
            onClick={() => {
              setShowImport((value) => !value);
            }}
          >
            <Upload aria-hidden="true" size={14} strokeWidth={1.8} />
          </IconButton>
        </div>
      </header>
      {proposal?.status === "pending" ? (
        <div className="border-b border-arc-border px-3 py-2">
          <p className="m-0 text-xs font-medium text-arc-foreground">Suggested {proposal.candidate.kind}</p>
          <p className="m-0 mt-1 text-xs text-arc-muted">{proposal.candidate.content}</p>
          <div className="mt-2 flex justify-end gap-1">
            <IconButton
              label="Reject suggested memory"
              onClick={() => {
                onReject(proposal.id);
              }}
            >
              <X aria-hidden="true" size={14} strokeWidth={1.8} />
            </IconButton>
            <button
              className="inline-flex h-7 items-center gap-1 rounded border border-arc-accent bg-arc-accent px-2 text-xs font-medium text-white hover:opacity-90"
              onClick={() => {
                onApprove(proposal.id);
              }}
              type="button"
            >
              <Check aria-hidden="true" size={13} strokeWidth={1.8} />
              Remember
            </button>
          </div>
        </div>
      ) : null}
      <form className="grid grid-cols-2 gap-1 border-b border-arc-border p-2" onSubmit={submit}>
        <textarea
          aria-label="Memory content"
          className="col-span-2 min-h-14 resize-y rounded border border-arc-input-border bg-arc-input px-2 py-1.5 text-xs text-arc-input-foreground outline-none focus:border-arc-focus"
          maxLength={2000}
          onChange={(event) => {
            setContent(event.target.value);
          }}
          placeholder="Remember"
          value={content}
        />
        <select
          aria-label="Memory kind"
          className="h-7 min-w-0 rounded border border-arc-input-border bg-arc-input px-1 text-xs text-arc-input-foreground"
          onChange={(event) => {
            setKind(event.target.value as MemoryDraft["kind"]);
          }}
          value={kind}
        >
          <option value="user">User</option>
          <option value="project">Project</option>
          <option value="architecture">Architecture</option>
          <option value="convention">Convention</option>
          <option value="decision">Decision</option>
          <option value="business_rule">Business rule</option>
        </select>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <select
            aria-label="Memory scope"
            className="h-7 min-w-0 flex-1 rounded border border-arc-input-border bg-arc-input px-1 text-xs text-arc-input-foreground"
            onChange={(event) => {
              setScope(event.target.value as MemoryDraft["scope"]);
            }}
            value={scope}
          >
            <option value="project">Project</option>
            <option value="user">User</option>
          </select>
          <label className="flex h-7 items-center gap-1 text-xs text-arc-muted" title="Pin memory">
            <input
              aria-label="Pin memory"
              checked={pinned}
              onChange={(event) => {
                setPinned(event.target.checked);
              }}
              type="checkbox"
            />
            <Pin aria-hidden="true" size={12} strokeWidth={1.8} />
          </label>
        </div>
        <input
          aria-label="Memory expiry"
          className="h-7 min-w-0 rounded border border-arc-input-border bg-arc-input px-1 text-xs text-arc-input-foreground"
          onChange={(event) => {
            setExpiresAt(event.target.value);
          }}
          type="datetime-local"
          value={expiresAt}
        />
        <button
          aria-label="Remember memory"
          className="grid h-7 place-items-center rounded border border-arc-accent bg-arc-accent text-white disabled:opacity-50"
          disabled={content.trim().length === 0}
          type="submit"
        >
          <Plus aria-hidden="true" size={14} strokeWidth={1.8} />
        </button>
      </form>
      {showImport ? (
        <form
          className="border-b border-arc-border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            onImport(importValue);
          }}
        >
          <textarea
            aria-label="Memory import JSON"
            className="min-h-14 w-full resize-y rounded border border-arc-input-border bg-arc-input px-2 py-1.5 text-xs text-arc-input-foreground outline-none focus:border-arc-focus"
            onChange={(event) => {
              setImportValue(event.target.value);
            }}
            value={importValue}
          />
          <div className="mt-1 flex justify-end">
            <button
              className="inline-flex h-7 items-center gap-1 rounded border border-arc-border px-2 text-xs text-arc-muted hover:bg-arc-hover hover:text-arc-foreground"
              disabled={importValue.trim().length === 0}
              type="submit"
            >
              <Upload aria-hidden="true" size={13} strokeWidth={1.8} />
              Import
            </button>
          </div>
        </form>
      ) : null}
      {error === undefined ? null : (
        <p className="m-0 border-b border-arc-border px-3 py-2 text-xs text-arc-danger">{error}</p>
      )}
      {records.length === 0 ? <p className="m-0 px-3 py-2 text-xs text-arc-muted">No memories</p> : null}
      {records.map((record) => {
        const editing = editingId === record.id;
        return (
          <div className="border-b border-arc-border px-3 py-2 last:border-b-0" key={record.id}>
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] text-arc-muted">{`${record.scope} · ${record.kind}`}</p>
                {isExpired(record) ? <p className="m-0 text-[11px] text-arc-warning">Expired</p> : null}
                {editing ? (
                  <textarea
                    aria-label="Edit memory"
                    autoFocus
                    className="mt-1 min-h-14 w-full resize-y rounded border border-arc-focus bg-arc-input px-2 py-1.5 text-xs text-arc-input-foreground outline-none"
                    maxLength={2000}
                    onChange={(event) => {
                      setEditingContent(event.target.value);
                    }}
                    value={editingContent}
                  />
                ) : (
                  <p className="m-0 mt-1 whitespace-pre-wrap text-xs text-arc-foreground">{record.content}</p>
                )}
              </div>
              {editing ? (
                <>
                  <IconButton
                    label="Save memory"
                    onClick={() => {
                      const content = editingContent.trim();
                      if (content.length > 0) {
                        onUpdate(record.id, { content });
                      }
                      setEditingId(undefined);
                    }}
                  >
                    <Check aria-hidden="true" size={13} strokeWidth={1.8} />
                  </IconButton>
                  <IconButton
                    label="Cancel editing memory"
                    onClick={() => {
                      setEditingId(undefined);
                    }}
                  >
                    <X aria-hidden="true" size={13} strokeWidth={1.8} />
                  </IconButton>
                </>
              ) : (
                <>
                  <IconButton
                    className={record.pinned ? "text-arc-accent" : undefined}
                    label={record.pinned ? "Unpin memory" : "Pin memory"}
                    onClick={() => {
                      onUpdate(record.id, { pinned: !record.pinned });
                    }}
                  >
                    <Pin aria-hidden="true" size={13} strokeWidth={1.8} />
                  </IconButton>
                  <IconButton
                    label="Edit memory"
                    onClick={() => {
                      setEditingId(record.id);
                      setEditingContent(record.content);
                    }}
                  >
                    <Pencil aria-hidden="true" size={13} strokeWidth={1.8} />
                  </IconButton>
                  <IconButton
                    label="Forget memory"
                    onClick={() => {
                      onForget(record.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" size={13} strokeWidth={1.8} />
                  </IconButton>
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function isExpired(record: MemoryRecord): boolean {
  return record.expiresAt !== null && new Date(record.expiresAt).getTime() <= Date.now() && !record.pinned;
}
