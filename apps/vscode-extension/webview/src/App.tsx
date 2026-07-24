import { Bot, RefreshCw } from "lucide-react";
import { type ReactElement, useEffect, useReducer, useState } from "react";

import { parseExtensionToWebviewMessage } from "../../src/features/chat/chatWebview.contract.js";
import { ChatComposer } from "./components/chat/ChatComposer.js";
import { ConversationView } from "./components/chat/ConversationView.js";
import { SessionHistory } from "./components/chat/SessionHistory.js";
import { IconButton } from "./components/ui/IconButton.js";
import { StatusIndicator, type StatusTone } from "./components/ui/StatusIndicator.js";
import { chatViewReducer, initialChatViewState } from "./chatView.reducer.js";
import { postToExtension } from "./vscode.js";

export function App() {
  const [state, dispatch] = useReducer(chatViewReducer, initialChatViewState);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>): void => {
      const message = parseExtensionToWebviewMessage(event.data);
      switch (message?.type) {
        case "status:update":
          dispatch({ snapshot: message.snapshot, type: "status:received" });
          return;
        case "chat:hydrated":
          dispatch({ session: message.session, type: "chat:hydrated" });
          return;
        case "conversations:updated":
          dispatch({ snapshot: message.snapshot, type: "conversations:updated" });
          return;
        case "conversations:error":
          dispatch({ message: message.message, type: "conversations:error" });
          return;
        case "chat:submitted":
          dispatch({ session: message.session, type: "chat:submitted" });
          return;
        case "chat:generation-started":
          dispatch({ requestId: message.requestId, type: "chat:generation-started" });
          return;
        case "chat:generation-delta":
          dispatch({
            content: message.content,
            requestId: message.requestId,
            type: "chat:generation-delta",
          });
          return;
        case "chat:generation-completed":
          dispatch({ requestId: message.requestId, type: "chat:generation-completed" });
          return;
        case "chat:generation-cancelled":
          dispatch({ requestId: message.requestId, type: "chat:generation-cancelled" });
          return;
        case "chat:generation-failed":
          dispatch({
            error: message.error,
            requestId: message.requestId,
            type: "chat:generation-failed",
          });
          return;
        case "chat:connection-updated":
          dispatch({ status: message.status, type: "chat:connection-updated" });
          return;
        default:
          return;
      }
    };

    window.addEventListener("message", onMessage);
    postToExtension({ type: "webview:ready" });
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const snapshot = state.snapshot;
  const backend = snapshot?.backend;
  const ollama = snapshot?.ollama;
  const backendStatus = backend === undefined ? "Checking" : backend === null ? "Unavailable" : "Connected";
  const backendTone: StatusTone = backend === undefined ? "idle" : backend === null ? "error" : "ready";
  const ollamaStatus = getOllamaLabel(ollama?.status);
  const ollamaTone = getOllamaTone(ollama?.status);
  const connectionStatus = state.chat?.connectionStatus ?? "idle";
  const isGenerating = state.chat?.activeGeneration !== null && state.chat !== undefined;
  const isConnectionReady = connectionStatus === "connected";
  const connectionLabel = getConnectionLabel(connectionStatus);

  function refreshStatus(): void {
    dispatch({ type: "status:refresh" });
    postToExtension({ type: "status:refresh" });
  }

  function submitChat(): void {
    const content = draft.trim();
    if (!isConnectionReady || isGenerating || content.length === 0) {
      return;
    }

    setDraft("");
    postToExtension({ content, type: "chat:submit" });
  }

  function cancelChat(): void {
    postToExtension({ type: "chat:cancel" });
  }

  function createConversation(): void {
    postToExtension({ type: "conversation:create" });
  }

  function selectConversation(sessionId: string): void {
    postToExtension({ sessionId, type: "conversation:select" });
  }

  function renameConversation(sessionId: string, title: string): void {
    postToExtension({ sessionId, title, type: "conversation:rename" });
  }

  function deleteConversation(sessionId: string): void {
    postToExtension({ sessionId, type: "conversation:delete" });
  }

  function copyCode(content: string): void {
    postToExtension({ content, type: "code:copy" });
  }

  function openExternal(url: string): void {
    postToExtension({ type: "link:open", url });
  }

  return (
    <main className="flex min-h-screen flex-col bg-arc-background text-arc-foreground">
      <header className="flex h-10 items-center justify-between border-b border-arc-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot aria-hidden="true" className="shrink-0 text-arc-accent" size={16} strokeWidth={1.8} />
          <h1 className="truncate text-sm font-semibold">Arc</h1>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs text-arc-muted">{connectionLabel}</span>
          <IconButton label="Refresh connection status" onClick={refreshStatus}>
            <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
          </IconButton>
        </div>
      </header>

      <section aria-label="Connection status" className="grid grid-cols-2 border-b border-arc-border px-3">
        <StatusRow detail={snapshot?.backendUrl} label="Backend" status={backendStatus} tone={backendTone} />
        <StatusRow
          detail={ollama?.model ?? ollama?.message ?? snapshot?.error}
          label="Ollama"
          status={ollamaStatus}
          tone={ollamaTone}
        />
      </section>
      <SessionHistory
        disabled={isGenerating}
        onCreate={createConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onSelect={selectConversation}
        snapshot={state.conversations}
      />
      {state.conversationError === undefined ? null : (
        <p className="m-0 border-b border-arc-border px-3 py-2 text-xs text-arc-danger" role="alert">
          {state.conversationError}
        </p>
      )}
      <ConversationView messages={state.chat?.messages ?? []} onCopyCode={copyCode} onOpenExternal={openExternal} />
      <ChatComposer
        connectionReady={isConnectionReady}
        isGenerating={isGenerating}
        onCancel={cancelChat}
        onChange={setDraft}
        onSubmit={submitChat}
        value={draft}
      />
    </main>
  );
}

function StatusRow({
  detail,
  label,
  status,
  tone,
}: {
  readonly detail: string | undefined;
  readonly label: string;
  readonly status: string;
  readonly tone: StatusTone;
}): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-2 border-r border-arc-border py-2 pr-2 last:border-r-0 last:pl-2 last:pr-0">
      <StatusIndicator tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="truncate text-xs text-arc-muted" title={detail}>
          {detail ?? "Waiting for Arc"}
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-arc-muted">{status}</span>
    </div>
  );
}

function getOllamaLabel(status: string | undefined): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "not_configured":
      return "Not configured";
    case "model_missing":
      return "Model missing";
    case "unreachable":
      return "Unavailable";
    case "error":
      return "Error";
    default:
      return "Checking";
  }
}

function getOllamaTone(status: string | undefined): StatusTone {
  switch (status) {
    case "ready":
      return "ready";
    case "not_configured":
    case "model_missing":
      return "warning";
    case "unreachable":
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function getConnectionLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "disconnected":
      return "Disconnected";
    default:
      return "Starting";
  }
}
