import type { ArcStatusSnapshot } from "../../src/features/chat/chatWebview.contract.js";

export interface ChatViewState {
  readonly snapshot: ArcStatusSnapshot | undefined;
}

export type ChatViewAction =
  | { readonly type: "status:received"; readonly snapshot: ArcStatusSnapshot }
  | { readonly type: "status:refresh" };

export const initialChatViewState: ChatViewState = {
  snapshot: undefined,
};

export function chatViewReducer(state: ChatViewState, action: ChatViewAction): ChatViewState {
  switch (action.type) {
    case "status:received":
      return { ...state, snapshot: action.snapshot };
    case "status:refresh":
      return state;
  }
}
