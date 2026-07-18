import type {
  ArcStatusSnapshot,
  ChatClientError,
  ChatConnectionStatus,
  ChatSessionSnapshot,
  ConversationListSnapshot,
} from "../../src/features/chat/chatWebview.contract.js";

export interface ChatViewState {
  readonly chat: ChatSessionSnapshot | undefined;
  readonly conversationError: string | undefined;
  readonly conversations: ConversationListSnapshot | undefined;
  readonly snapshot: ArcStatusSnapshot | undefined;
}

export type ChatViewAction =
  | { readonly type: "status:received"; readonly snapshot: ArcStatusSnapshot }
  | { readonly type: "status:refresh" }
  | { readonly type: "chat:hydrated"; readonly session: ChatSessionSnapshot }
  | { readonly type: "conversations:updated"; readonly snapshot: ConversationListSnapshot }
  | { readonly type: "conversations:error"; readonly message: string }
  | { readonly type: "chat:submitted"; readonly session: ChatSessionSnapshot }
  | { readonly type: "chat:generation-started"; readonly requestId: string }
  | { readonly type: "chat:generation-delta"; readonly requestId: string; readonly content: string }
  | { readonly type: "chat:generation-completed"; readonly requestId: string }
  | { readonly type: "chat:generation-cancelled"; readonly requestId: string }
  | {
      readonly type: "chat:generation-failed";
      readonly requestId: string;
      readonly error: ChatClientError;
    }
  | { readonly type: "chat:connection-updated"; readonly status: ChatConnectionStatus };

export const initialChatViewState: ChatViewState = {
  chat: undefined,
  conversationError: undefined,
  conversations: undefined,
  snapshot: undefined,
};

export function chatViewReducer(state: ChatViewState, action: ChatViewAction): ChatViewState {
  switch (action.type) {
    case "status:received":
      return { ...state, snapshot: action.snapshot };
    case "status:refresh":
      return state;
    case "chat:hydrated":
    case "chat:submitted":
      return { ...state, chat: action.session };
    case "conversations:updated":
      return { ...state, conversationError: undefined, conversations: action.snapshot };
    case "conversations:error":
      return { ...state, conversationError: action.message };
    case "chat:generation-started":
      return updateActiveAssistant(state, action.requestId, ["pending"], (message) => ({
        ...message,
        status: "streaming",
      }));
    case "chat:generation-delta":
      return updateActiveAssistant(state, action.requestId, ["streaming"], (message) => ({
        ...message,
        content: `${message.content}${action.content}`,
      }));
    case "chat:generation-completed":
      return completeActiveGeneration(state, action.requestId, (message) => ({
        ...message,
        status: "completed",
      }));
    case "chat:generation-cancelled":
      return completeActiveGeneration(state, action.requestId, (message) => ({
        ...message,
        status: "cancelled",
      }));
    case "chat:generation-failed":
      return completeActiveGeneration(state, action.requestId, (message) => ({
        ...message,
        error: action.error,
        status: "failed",
      }));
    case "chat:connection-updated":
      return state.chat === undefined
        ? state
        : {
            ...state,
            chat: {
              ...state.chat,
              connectionStatus: action.status,
            },
          };
  }
}

function updateActiveAssistant(
  state: ChatViewState,
  requestId: string,
  acceptedStatuses: readonly ChatSessionSnapshot["messages"][number]["status"][],
  update: (message: ChatSessionSnapshot["messages"][number]) => ChatSessionSnapshot["messages"][number],
): ChatViewState {
  const activeGeneration = state.chat?.activeGeneration;
  if (state.chat === undefined || activeGeneration?.requestId !== requestId) {
    return state;
  }

  const assistantMessage = state.chat.messages.find((message) => message.id === activeGeneration.assistantMessageId);
  if (assistantMessage === undefined || !acceptedStatuses.includes(assistantMessage.status)) {
    return state;
  }

  return {
    ...state,
    chat: {
      ...state.chat,
      messages: state.chat.messages.map((message) => (message.id === assistantMessage.id ? update(message) : message)),
    },
  };
}

function completeActiveGeneration(
  state: ChatViewState,
  requestId: string,
  update: (message: ChatSessionSnapshot["messages"][number]) => ChatSessionSnapshot["messages"][number],
): ChatViewState {
  const activeGeneration = state.chat?.activeGeneration;
  if (state.chat === undefined || activeGeneration?.requestId !== requestId) {
    return state;
  }

  const assistantMessage = state.chat.messages.find((message) => message.id === activeGeneration.assistantMessageId);
  if (
    assistantMessage === undefined ||
    (assistantMessage.status !== "pending" && assistantMessage.status !== "streaming")
  ) {
    return state;
  }

  return {
    ...state,
    chat: {
      ...state.chat,
      activeGeneration: null,
      messages: state.chat.messages.map((message) => (message.id === assistantMessage.id ? update(message) : message)),
    },
  };
}
