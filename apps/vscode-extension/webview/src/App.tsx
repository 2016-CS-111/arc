import { Bot, LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useReducer, useState } from "react";

import {
  type ChatConnectionStatus,
  parseExtensionToWebviewMessage,
} from "../../src/features/chat/chatWebview.contract.js";
import { ChatDeltaBatcher } from "./ChatDeltaBatcher.js";
import { ChatComposer } from "./components/chat/ChatComposer.js";
import { ConversationView } from "./components/chat/ConversationView.js";
import { EditProposalPanel } from "./components/edits/EditProposalPanel.js";
import { SessionHistory } from "./components/chat/SessionHistory.js";
import { IconButton } from "./components/ui/IconButton.js";
import { StatusIndicator, type StatusTone } from "./components/ui/StatusIndicator.js";
import { chatViewReducer, initialChatViewState } from "./chatView.reducer.js";
import { postToExtension } from "./vscode.js";

export function App() {
  const [state, dispatch] = useReducer(chatViewReducer, initialChatViewState);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const deltaBatcher = new ChatDeltaBatcher((delta) => {
      dispatch({ content: delta.content, requestId: delta.requestId, type: "chat:generation-delta" });
    });

    const onMessage = (event: MessageEvent<unknown>): void => {
      const message = parseExtensionToWebviewMessage(event.data);
      switch (message?.type) {
        case "status:update":
          dispatch({ snapshot: message.snapshot, type: "status:received" });
          return;
        case "chat:hydrated":
          deltaBatcher.clear();
          dispatch({ session: message.session, type: "chat:hydrated" });
          return;
        case "conversations:updated":
          dispatch({ snapshot: message.snapshot, type: "conversations:updated" });
          return;
        case "conversations:error":
          dispatch({ message: message.message, type: "conversations:error" });
          return;
        case "chat:submitted":
          deltaBatcher.clear();
          dispatch({ session: message.session, type: "chat:submitted" });
          return;
        case "chat:generation-started":
          dispatch({ requestId: message.requestId, type: "chat:generation-started" });
          return;
        case "chat:generation-delta":
          deltaBatcher.append(message.requestId, message.content);
          return;
        case "chat:generation-completed":
          deltaBatcher.flush(message.requestId);
          dispatch({ requestId: message.requestId, type: "chat:generation-completed" });
          return;
        case "chat:generation-cancelled":
          deltaBatcher.flush(message.requestId);
          dispatch({ requestId: message.requestId, type: "chat:generation-cancelled" });
          return;
        case "chat:generation-failed":
          deltaBatcher.flush(message.requestId);
          dispatch({
            error: message.error,
            requestId: message.requestId,
            type: "chat:generation-failed",
          });
          return;
        case "chat:connection-updated":
          dispatch({ status: message.status, type: "chat:connection-updated" });
          return;
        case "edits:proposed":
          dispatch({ proposal: message.proposal, type: "edits:proposed" });
          return;
        case "edits:updated":
          dispatch({ proposal: message.proposal, type: "edits:updated" });
          return;
        case "edits:error":
          dispatch({ message: message.message, type: "edits:error" });
          return;
        default:
          return;
      }
    };

    window.addEventListener("message", onMessage);
    postToExtension({ type: "webview:ready" });
    return () => {
      window.removeEventListener("message", onMessage);
      deltaBatcher.dispose();
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
    postToExtension({ type: "chat:reconnect" });
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

  const copyCode = useCallback((content: string): void => {
    postToExtension({ content, type: "code:copy" });
  }, []);

  const openExternal = useCallback((url: string): void => {
    postToExtension({ type: "link:open", url });
  }, []);

  const previewEdit = useCallback((proposalId: string, operationId: string): void => {
    postToExtension({ operationId, proposalId, type: "edits:preview" });
  }, []);

  const approveEdits = useCallback((proposalId: string, operationIds: readonly string[]): void => {
    postToExtension({ operationIds: [...operationIds], proposalId, type: "edits:approve" });
  }, []);

  const rejectEdits = useCallback((proposalId: string): void => {
    postToExtension({ proposalId, type: "edits:reject" });
  }, []);

  const undoEdits = useCallback((proposalId: string): void => {
    postToExtension({ proposalId, type: "edits:undo" });
  }, []);

  return (
    <main className="flex h-screen overflow-hidden flex-col bg-arc-background text-arc-foreground">
      <header className="flex h-10 items-center justify-between border-b border-arc-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot aria-hidden="true" className="shrink-0 text-arc-accent" size={16} strokeWidth={1.8} />
          <h1 className="truncate text-sm font-semibold">Arc</h1>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs text-arc-muted">{connectionLabel}</span>
          <IconButton
            label={connectionStatus === "offline" ? "Reconnect Arc" : "Refresh connection status"}
            onClick={refreshStatus}
          >
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
      <ConnectionNotice onReconnect={refreshStatus} status={connectionStatus} />
      <ConversationView
        messages={state.chat?.messages ?? []}
        onCopyCode={copyCode}
        onOpenExternal={openExternal}
        sessionId={state.chat?.sessionId}
      />
      <EditProposalPanel
        error={state.editError}
        onApprove={approveEdits}
        onPreview={previewEdit}
        onReject={rejectEdits}
        onUndo={undoEdits}
        proposal={state.editProposal}
      />
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

function ConnectionNotice({
  onReconnect,
  status,
}: {
  readonly onReconnect: () => void;
  readonly status: ChatConnectionStatus;
}): ReactElement | null {
  if (status === "connected" || status === "idle") {
    return null;
  }

  const isOffline = status === "offline";
  return (
    <div
      aria-live="polite"
      className="flex min-h-9 items-center gap-2 border-b border-arc-border px-3 py-1.5 text-xs text-arc-muted"
      role={isOffline ? "alert" : "status"}
    >
      {isOffline ? (
        <WifiOff aria-hidden="true" className="shrink-0 text-arc-warning" size={14} strokeWidth={1.8} />
      ) : (
        <LoaderCircle aria-hidden="true" className="shrink-0 animate-spin" size={14} strokeWidth={1.8} />
      )}
      <span className="min-w-0 flex-1">
        {status === "connecting" ? "Connecting to Arc" : isOffline ? "Arc is offline" : "Connection lost. Reconnecting"}
      </span>
      {isOffline ? (
        <IconButton label="Reconnect Arc" onClick={onReconnect}>
          <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
        </IconButton>
      ) : null}
    </div>
  );
}

function getConnectionLabel(status: ChatConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "offline":
      return "Offline";
    default:
      return "Starting";
  }
}
