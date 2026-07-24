import { ArrowDown, Bot, CircleAlert, LoaderCircle, UserRound } from "lucide-react";
import { lazy, memo, Suspense, type ReactElement, useEffect, useRef, useState } from "react";

import type { ChatSessionMessage } from "../../../../src/features/chat/chatWebview.contract.js";
import { cn } from "../../lib/cn.js";
import { IconButton } from "../ui/IconButton.js";

const MarkdownMessage = lazy(async () => {
  const module = await import("./MarkdownMessage.js");
  return { default: module.MarkdownMessage };
});

const followThresholdPx = 24;

interface ScrollMetrics {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}

export interface ConversationViewProps {
  readonly messages: readonly ChatSessionMessage[];
  readonly onCopyCode: (content: string) => void;
  readonly onOpenExternal: (url: string) => void;
  readonly sessionId: string | undefined;
}

export function ConversationView({
  messages,
  onCopyCode,
  onOpenExternal,
  sessionId,
}: ConversationViewProps): ReactElement {
  const [isFollowing, setIsFollowing] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsFollowing(true);
  }, [sessionId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport !== null && isFollowing) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [isFollowing, messages]);

  function handleScroll(): void {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }

    const nextIsFollowing = isNearConversationBottom(viewport);
    setIsFollowing((currentIsFollowing) =>
      currentIsFollowing === nextIsFollowing ? currentIsFollowing : nextIsFollowing,
    );
  }

  function jumpToLatest(): void {
    const viewport = viewportRef.current;
    if (viewport !== null) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    setIsFollowing(true);
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
    <div className="relative min-h-0 flex-1">
      <section
        ref={viewportRef}
        aria-label="Conversation"
        className="h-full overflow-x-hidden overflow-y-auto px-3 py-4"
        onScroll={handleScroll}
        role="log"
      >
        <div className="flex min-w-0 flex-col gap-4">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} onCopyCode={onCopyCode} onOpenExternal={onOpenExternal} />
          ))}
        </div>
      </section>
      {isFollowing ? null : (
        <IconButton
          className="absolute bottom-3 right-3 border-arc-border bg-arc-surface text-arc-foreground shadow-md"
          label="Jump to latest message"
          onClick={jumpToLatest}
        >
          <ArrowDown aria-hidden="true" size={15} strokeWidth={1.8} />
        </IconButton>
      )}
    </div>
  );
}

interface MessageItemProps {
  readonly message: ChatSessionMessage;
  readonly onCopyCode: (content: string) => void;
  readonly onOpenExternal: (url: string) => void;
}

const MessageItem = memo(function MessageItem({ message, onCopyCode, onOpenExternal }: MessageItemProps): ReactElement {
  const isUser = message.role === "user";
  const isWorking = message.status === "pending" || message.status === "streaming";
  const fallbackContent = message.status === "pending" ? "Thinking..." : "Generating...";

  return (
    <article className={cn("flex min-w-0 gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
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
          "min-w-0 rounded-md border px-3 py-2 text-sm",
          isUser
            ? "max-w-[calc(100%-2rem)] border-arc-user bg-arc-user text-arc-user-foreground"
            : "flex-1 border-arc-border bg-arc-surface text-arc-foreground",
        )}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap break-words leading-5">{message.content}</p>
        ) : (
          <Suspense
            fallback={
              <p className="m-0 whitespace-pre-wrap break-words leading-5">
                {message.content.length > 0 ? message.content : fallbackContent}
              </p>
            }
          >
            <MarkdownMessage
              canCopy={!isWorking}
              content={message.content.length > 0 ? message.content : fallbackContent}
              onCopyCode={onCopyCode}
              onOpenExternal={onOpenExternal}
            />
          </Suspense>
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
});

export function isNearConversationBottom(metrics: ScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= followThresholdPx;
}
