import type { ToolCall, ToolDefinition, ToolError, ToolResult } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../config/config.constants.js";
import type { AppConfig } from "../../../config/env.js";
import { ARC_LOGGER } from "../../logger/logger.constants.js";
import type { ToolExecutionContext, ToolHandler } from "../domain/tool-handler.js";
import { ToolPermissionService } from "./tool-permission.service.js";
import { ToolRegistryService } from "./tool-registry.service.js";

export interface ToolRuntimeContext {
  readonly requestId: string;
  readonly sessionId: string;
  readonly projectId?: string;
  readonly signal: AbortSignal;
}

@Injectable()
export class ToolRuntimeService {
  public constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ARC_LOGGER) private readonly logger: Logger,
    @Inject(ToolRegistryService) private readonly registry: ToolRegistryService,
    @Inject(ToolPermissionService) private readonly permissionService: ToolPermissionService,
  ) {}

  public getDefinitions(): readonly ToolDefinition[] {
    return this.registry.getDefinitions();
  }

  public getMaxCallsPerTurn(): number {
    return this.config.tools.maxCallsPerTurn;
  }

  public async execute(call: ToolCall, context: ToolRuntimeContext): Promise<ToolResult> {
    const startedAt = performance.now();
    const handler = this.registry.find(call.name);
    if (handler === undefined) {
      const result = this.createResult(call, "rejected", "Unknown Arc tool.", "unknown_tool");
      this.logCompletion(call, context, result, startedAt);
      return result;
    }

    const permission = this.permissionService.authorize(handler.definition);
    if (!permission.allowed) {
      const result = this.createResult(call, "rejected", "This Arc tool requires user approval.", "approval_required");
      this.logCompletion(call, context, result, startedAt);
      return result;
    }

    if (context.signal.aborted) {
      const result = this.createResult(call, "cancelled", "The Arc tool call was cancelled.", "execution_cancelled");
      this.logCompletion(call, context, result, startedAt);
      return result;
    }

    this.logger.info("Arc tool execution started", this.createLogContext(call, context));

    try {
      const result = await this.executeWithLimits(handler, call, context);
      const content = this.limitContent(JSON.stringify({ result: result ?? null }));
      const toolResult: ToolResult = {
        callId: call.id,
        name: call.name,
        status: "completed",
        content: content.value,
        ...(content.truncated ? { truncated: true } : {}),
      };
      this.logCompletion(call, context, toolResult, startedAt);
      return toolResult;
    } catch (error) {
      const toolResult = this.toFailureResult(call, error, context.signal);
      this.logCompletion(call, context, toolResult, startedAt);
      return toolResult;
    }
  }

  private async executeWithLimits(
    handler: ToolHandler,
    call: ToolCall,
    context: ToolRuntimeContext,
  ): Promise<unknown> {
    const controller = new AbortController();
    let didTimeout = false;
    const onParentAbort = (): void => controller.abort(context.signal.reason);
    context.signal.addEventListener("abort", onParentAbort, { once: true });
    const timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, this.config.tools.timeoutMs);

    try {
      return await waitForToolResult(
        handler.execute(call, this.createExecutionContext(context, controller.signal)),
        controller.signal,
        () => didTimeout,
      );
    } finally {
      clearTimeout(timeout);
      context.signal.removeEventListener("abort", onParentAbort);
    }
  }

  private createExecutionContext(context: ToolRuntimeContext, signal: AbortSignal): ToolExecutionContext {
    return {
      requestId: context.requestId,
      sessionId: context.sessionId,
      signal,
      ...(context.projectId === undefined ? {} : { projectId: context.projectId }),
    };
  }

  private toFailureResult(call: ToolCall, error: unknown, signal: AbortSignal): ToolResult {
    if (error instanceof ToolExecutionAbortError) {
      const timedOut = error.didTimeout;
      return this.createResult(
        call,
        timedOut ? "timed_out" : "cancelled",
        timedOut ? "The Arc tool call exceeded its time limit." : "The Arc tool call was cancelled.",
        timedOut ? "execution_timed_out" : "execution_cancelled",
      );
    }

    if (signal.aborted) {
      return this.createResult(call, "cancelled", "The Arc tool call was cancelled.", "execution_cancelled");
    }

    return this.createResult(call, "failed", "The Arc tool could not complete.", "execution_failed");
  }

  private createResult(
    call: ToolCall,
    status: ToolResult["status"],
    message: string,
    code: ToolError["code"],
  ): ToolResult {
    return {
      callId: call.id,
      name: call.name,
      status,
      content: JSON.stringify({ error: { code, message } }),
      error: { code, message },
    };
  }

  private limitContent(content: string): { readonly value: string; readonly truncated: boolean } {
    if (content.length <= this.config.tools.maxResultChars) {
      return { value: content, truncated: false };
    }

    return {
      value: content.slice(0, this.config.tools.maxResultChars),
      truncated: true,
    };
  }

  private logCompletion(
    call: ToolCall,
    context: ToolRuntimeContext,
    result: ToolResult,
    startedAt: number,
  ): void {
    this.logger.info("Arc tool execution completed", {
      ...this.createLogContext(call, context),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      outputChars: result.content.length,
      status: result.status,
    });
  }

  private createLogContext(call: ToolCall, context: ToolRuntimeContext): Record<string, unknown> {
    return {
      callId: call.id,
      requestId: context.requestId,
      sessionId: context.sessionId,
      toolName: call.name,
      ...(context.projectId === undefined ? {} : { projectId: context.projectId }),
    };
  }
}

class ToolExecutionAbortError extends Error {
  public constructor(public readonly didTimeout: boolean) {
    super("Arc tool execution was aborted.");
  }
}

function waitForToolResult<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  didTimeout: () => boolean,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(new ToolExecutionAbortError(didTimeout()));
    };
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
