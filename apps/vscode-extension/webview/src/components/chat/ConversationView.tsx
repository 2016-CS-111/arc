import { Bot, CircleAlert, LoaderCircle, UserRound } from "lucide-react";
import { type ReactElement, useEffect, useRef } from "react";

import type { ChatSessionMessage } from "../../../../src/features/chat/chatWebview.contract.js";
import { cn } from "../../lib/cn.js";
import { MarkdownMessage } from "./MarkdownMessage.js";

export interface ConversationViewProps {
  readonly messages: readonly ChatSessionMessage[];
  readonly onCopyCode: (content: string) => void;
  readonly onOpenExternal: (url: string) => void;
}

export function ConversationView({ messages, onCopyCode, onOpenExternal }: ConversationViewProps): ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport !== null && shouldFollowRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  function handleScroll(): void {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }

    shouldFollowRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
  }

  if (messages.length === 0) {
    return (
      <section className="grid flex-1 place-items-center px-5" aria-label="Conversation">
        <div className="flex max-w-52 flex-col items-center gap-2 text-center text-arc-muted">
          <Bot aria-hidden="true" className="text-arc-accent" size={22} strokeWidth={1.6} />
          <p className="m-0 text-sm">Start a conversation</p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={viewportRef}
      aria-label="Conversation"
      className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
      onScroll={handleScroll}
      role="log"
    >
      <div className="flex flex-col gap-4">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} onCopyCode={onCopyCode} onOpenExternal={onOpenExternal} />
        ))}
      </div>
    </section>
  );
}

function MessageItem({
  message,
  onCopyCode,
  onOpenExternal,
}: {
  readonly message: ChatSessionMessage;
  readonly onCopyCode: (content: string) => void;
  readonly onOpenExternal: (url: string) => void;
}): ReactElement {
  const isUser = message.role === "user";
  const isWorking = message.status === "pending" || message.status === "streaming";
  const fallbackContent = message.status === "pending" ? "Thinking..." : "Generating...";

  return (
    <article className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
          isUser ? "bg-arc-user text-arc-user-foreground" : "bg-arc-surface text-arc-accent",
        )}
      >
        {isUser ? <UserRound size={14} strokeWidth={1.8} /> : <Bot size={14} strokeWidth={1.8} />}
      </div>
      <div
        className={cn(
          "min-w-0 max-w-[calc(100%-2rem)] rounded-md border px-3 py-2 text-sm",
          isUser
            ? "border-arc-user bg-arc-user text-arc-user-foreground"
            : "border-arc-border bg-arc-surface text-arc-foreground",
        )}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap break-words leading-5">{message.content}</p>
        ) : (
          <MarkdownMessage
            canCopy={!isWorking}
            content={message.content.length > 0 ? message.content : fallbackContent}
            onCopyCode={onCopyCode}
            onOpenExternal={onOpenExternal}
          />
        )}
        {isWorking ? (
          <LoaderCircle aria-label="Generating response" className="mt-2 animate-spin text-arc-muted" size={14} />
        ) : null}
        {message.status === "cancelled" ? <p className="mb-0 mt-2 text-xs text-arc-muted">Stopped</p> : null}
        {message.status === "failed" && message.error !== undefined ? (
          <p className="mb-0 mt-2 flex items-start gap-1.5 text-xs text-arc-danger">
            <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
            <span>{message.error.message}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}
