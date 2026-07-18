import { Check, FilePlus2, Pencil, Trash2, X } from "lucide-react";
import { type ReactElement, type SyntheticEvent, useState } from "react";

import type { ConversationListSnapshot } from "../../../../src/features/chat/chatWebview.contract.js";
import { IconButton } from "../ui/IconButton.js";
import { cn } from "../../lib/cn.js";

export interface SessionHistoryProps {
  readonly disabled: boolean;
  readonly onCreate: () => void;
  readonly onDelete: (sessionId: string) => void;
  readonly onRename: (sessionId: string, title: string) => void;
  readonly onSelect: (sessionId: string) => void;
  readonly snapshot: ConversationListSnapshot | undefined;
}

export function SessionHistory({
  disabled,
  onCreate,
  onDelete,
  onRename,
  onSelect,
  snapshot,
}: SessionHistoryProps): ReactElement {
  const [editingSessionId, setEditingSessionId] = useState<string | undefined>();
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const sessions = snapshot?.sessions ?? [];

  function beginRename(sessionId: string, currentTitle: string): void {
    setPendingDeleteSessionId(undefined);
    setEditingSessionId(sessionId);
    setTitle(currentTitle);
  }

  function submitRename(event: SyntheticEvent<HTMLFormElement>, sessionId: string): void {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0) {
      return;
    }

    onRename(sessionId, normalizedTitle);
    setEditingSessionId(undefined);
  }

  return (
    <section aria-label="Conversation history" className="border-b border-arc-border">
      <header className="flex h-9 items-center justify-between px-3">
        <h2 className="m-0 text-xs font-semibold text-arc-muted">Conversations</h2>
        <IconButton disabled={disabled} label="New conversation" onClick={onCreate}>
          <FilePlus2 aria-hidden="true" size={15} strokeWidth={1.8} />
        </IconButton>
      </header>
      <div className="max-h-32 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 ? <p className="m-0 px-1 py-2 text-xs text-arc-muted">No saved conversations</p> : null}
        {sessions.map((session) => {
          const isActive = session.id === snapshot?.activeSessionId;
          const isEditing = session.id === editingSessionId;
          const isPendingDelete = session.id === pendingDeleteSessionId;

          if (isEditing) {
            return (
              <form
                className="flex h-8 items-center gap-1 px-1"
                key={session.id}
                onSubmit={(event) => {
                  submitRename(event, session.id);
                }}
              >
                <input
                  aria-label="Conversation title"
                  autoFocus
                  className="min-w-0 flex-1 rounded border border-arc-focus bg-arc-input px-1.5 py-1 text-xs text-arc-input-foreground outline-none"
                  disabled={disabled}
                  maxLength={120}
                  onChange={(event) => {
                    setTitle(event.target.value);
                  }}
                  value={title}
                />
                <IconButton
                  disabled={disabled || title.trim().length === 0}
                  label="Save conversation title"
                  type="submit"
                >
                  <Check aria-hidden="true" size={14} strokeWidth={1.8} />
                </IconButton>
                <IconButton
                  label="Cancel renaming conversation"
                  onClick={() => {
                    setEditingSessionId(undefined);
                  }}
                >
                  <X aria-hidden="true" size={14} strokeWidth={1.8} />
                </IconButton>
              </form>
            );
          }

          return (
            <div
              className={cn(
                "flex h-8 min-w-0 items-center gap-0.5 rounded px-1",
                isActive ? "bg-arc-hover text-arc-foreground" : "text-arc-muted",
              )}
              key={session.id}
            >
              <button
                aria-current={isActive ? "page" : undefined}
                className="min-w-0 flex-1 truncate px-1 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-arc-focus disabled:cursor-not-allowed"
                disabled={disabled || isActive}
                onClick={() => {
                  onSelect(session.id);
                }}
                title={session.title}
                type="button"
              >
                {session.title}
              </button>
              {isPendingDelete ? (
                <>
                  <IconButton
                    disabled={disabled}
                    label="Confirm delete conversation"
                    onClick={() => {
                      onDelete(session.id);
                    }}
                  >
                    <Check aria-hidden="true" size={14} strokeWidth={1.8} />
                  </IconButton>
                  <IconButton
                    label="Cancel deleting conversation"
                    onClick={() => {
                      setPendingDeleteSessionId(undefined);
                    }}
                  >
                    <X aria-hidden="true" size={14} strokeWidth={1.8} />
                  </IconButton>
                </>
              ) : (
                <>
                  <IconButton
                    disabled={disabled}
                    label="Rename conversation"
                    onClick={() => {
                      beginRename(session.id, session.title);
                    }}
                  >
                    <Pencil aria-hidden="true" size={13} strokeWidth={1.8} />
                  </IconButton>
                  <IconButton
                    disabled={disabled}
                    label="Delete conversation"
                    onClick={() => {
                      setEditingSessionId(undefined);
                      setPendingDeleteSessionId(session.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" size={13} strokeWidth={1.8} />
                  </IconButton>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
