import type {
  ChatAcceptedEvent,
  ChatCancelCommand,
  ChatCancelledEvent,
  ChatCompletedEvent,
  ChatDeltaEvent,
  ChatEditProposalEvent,
  ChatErrorEvent,
  ChatSendCommand,
} from "@arc/contracts";

import type { ChatConnectionStatus } from "./chatWebview.contract.js";

export type ChatTransportEvent =
  | { readonly type: "connection-status"; readonly status: ChatConnectionStatus }
  | { readonly type: "connection-error"; readonly message: string }
  | { readonly type: "accepted"; readonly payload: ChatAcceptedEvent }
  | { readonly type: "delta"; readonly payload: ChatDeltaEvent }
  | { readonly type: "completed"; readonly payload: ChatCompletedEvent }
  | { readonly type: "cancelled"; readonly payload: ChatCancelledEvent }
  | { readonly type: "error"; readonly payload: ChatErrorEvent }
  | { readonly type: "edit-proposal"; readonly payload: ChatEditProposalEvent }
  | { readonly type: "malformed-event"; readonly eventName: string };

export interface ChatTransportSubscription {
  dispose(): void;
}

export interface ChatTransportPort {
  readonly connectionStatus: ChatConnectionStatus;

  connect(): void;
  send(command: ChatSendCommand): void;
  cancel(command: ChatCancelCommand): void;
  subscribe(listener: (event: ChatTransportEvent) => void): ChatTransportSubscription;
  dispose(): void;
}
