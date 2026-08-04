import { Inject, Injectable } from "@nestjs/common";

import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import { CHAT_MODEL } from "../../inference/inference.constants.js";
import type {
  ChatModelEvent,
  ChatModelMessage,
  ChatModelToolCall,
  ChatModelToolDefinition,
} from "../../inference/domain/chat-model.types.js";
import { ToolCallFallbackParser } from "../../tools/application/tool-call-fallback.parser.js";
import { ToolRuntimeService } from "../../tools/application/tool-runtime.service.js";

@Injectable()
export class SendChatMessageService {
  public constructor(
    @Inject(CHAT_MODEL) private readonly chatModel: ChatModelPort,
    @Inject(ToolRuntimeService) private readonly toolRuntime: ToolRuntimeService,
  ) {}

  public async *stream(
    input: SendChatMessageInput,
    signal: AbortSignal,
  ): AsyncGenerator<Exclude<ChatModelEvent, { readonly type: "tool_calls" }>> {
    const tools = this.toModelTools();
    let messages: readonly ChatModelMessage[] = input.messages;
    let completedEvent: Exclude<ChatModelEvent, { readonly type: "delta" } | { readonly type: "tool_calls" }> | undefined;
    let callsUsed = 0;

    while (true) {
      let assistantContent = "";
      const toolCalls: ChatModelToolCall[] = [];
      completedEvent = undefined;

      for await (const event of this.chatModel.streamChat(
        {
          messages,
          ...(callsUsed < this.toolRuntime.getMaxCallsPerTurn() && tools.length > 0 ? { tools } : {}),
        },
        signal,
      )) {
        if (event.type === "delta") {
          assistantContent += event.content;
          yield event;
          continue;
        }

        if (event.type === "tool_calls") {
          toolCalls.push(...event.calls);
          continue;
        }

        completedEvent = event;
      }

      const fallbackCall =
        toolCalls.length === 0 && callsUsed < this.toolRuntime.getMaxCallsPerTurn()
          ? new ToolCallFallbackParser().parse(assistantContent, `fallback_${String(callsUsed + 1)}`)
          : undefined;
      const requestedCalls = fallbackCall === undefined ? toolCalls : [fallbackCall];

      if (requestedCalls.length === 0) {
        if (completedEvent === undefined) {
          throw new Error("Arc model response completed without a terminal event.");
        }

        yield completedEvent;
        return;
      }

      const remainingCalls = this.toolRuntime.getMaxCallsPerTurn() - callsUsed;
      if (remainingCalls <= 0) {
        if (completedEvent === undefined) {
          throw new Error("Arc model response completed without a terminal event.");
        }

        yield completedEvent;
        return;
      }

      const callsToExecute = requestedCalls.slice(0, remainingCalls);
      const results = await Promise.all(
        callsToExecute.map((call) =>
          this.toolRuntime.execute(call, {
            requestId: input.requestId,
            sessionId: input.sessionId,
            signal,
            ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          }),
        ),
      );
      callsUsed += callsToExecute.length;
      messages = [
        ...messages,
        {
          role: "assistant",
          content: assistantContent,
          toolCalls: callsToExecute,
        },
        ...results.map((result) => ({
          role: "tool" as const,
          content: result.content,
          toolName: result.name,
        })),
      ];
    }
  }

  private toModelTools(): readonly ChatModelToolDefinition[] {
    return this.toolRuntime.getDefinitions().map((definition) => ({
      type: "function",
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
      },
    }));
  }

}

export interface SendChatMessageInput {
  readonly messages: readonly ChatModelMessage[];
  readonly requestId: string;
  readonly sessionId: string;
  readonly projectId?: string;
}
