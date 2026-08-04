import type { ToolCall, ToolDefinition } from "@arc/contracts";

export interface ToolExecutionContext {
  readonly clientId?: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly projectId?: string;
  readonly signal: AbortSignal;
}

export interface ToolHandler {
  readonly definition: ToolDefinition;
  execute(call: ToolCall, context: ToolExecutionContext): Promise<unknown>;
}
