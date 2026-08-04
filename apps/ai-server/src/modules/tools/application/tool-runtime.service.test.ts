import type { AppConfig } from "../../../config/env.js";
import type { Logger } from "@arc/shared";
import { describe, expect, it } from "vitest";

import type { ToolHandler } from "../domain/tool-handler.js";
import { ToolPermissionService } from "./tool-permission.service.js";
import { ToolRegistryService } from "./tool-registry.service.js";
import { ToolRuntimeService } from "./tool-runtime.service.js";

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};

function createRuntime(handler: ToolHandler, maxResultChars = 8_192): ToolRuntimeService {
  return new ToolRuntimeService(
    {
      tools: {
        maxCallsPerTurn: 4,
        maxResultChars,
        timeoutMs: 10,
      },
    } as AppConfig,
    logger,
    new ToolRegistryService([handler]),
    new ToolPermissionService(),
  );
}

function createContext(signal: AbortSignal = new AbortController().signal) {
  return {
    requestId: "request_1",
    sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
    signal,
  };
}

describe("ToolRuntimeService", () => {
  it("runs a registered harmless tool with bounded output", async () => {
    const runtime = createRuntime({
      definition: {
        name: "arc.runtime_info",
        description: "Return runtime information.",
        permission: "read",
        parameters: { type: "object" },
      },
      execute: async (): Promise<unknown> => ({ runtime: "arc", value: "x".repeat(100) }),
    }, 40);

    await expect(
      runtime.execute({ id: "call_1", name: "arc.runtime_info", arguments: {} }, createContext()),
    ).resolves.toMatchObject({
      callId: "call_1",
      name: "arc.runtime_info",
      status: "completed",
      truncated: true,
    });
  });

  it("rejects unknown and approval-gated tools without executing them", async () => {
    const runtime = createRuntime({
      definition: {
        name: "arc.privileged_fixture",
        description: "A future privileged fixture.",
        permission: "write",
        parameters: { type: "object" },
      },
      execute: async (): Promise<unknown> => ({ shouldNotRun: true }),
    });

    await expect(
      runtime.execute({ id: "call_1", name: "missing.tool", arguments: {} }, createContext()),
    ).resolves.toMatchObject({ status: "rejected", error: { code: "unknown_tool" } });
    await expect(
      runtime.execute({ id: "call_2", name: "arc.privileged_fixture", arguments: {} }, createContext()),
    ).resolves.toMatchObject({ status: "rejected", error: { code: "approval_required" } });
  });

  it("returns cancellation when the chat request has already stopped", async () => {
    const controller = new AbortController();
    controller.abort();
    const runtime = createRuntime({
      definition: {
        name: "arc.runtime_info",
        description: "Return runtime information.",
        permission: "none",
        parameters: { type: "object" },
      },
      execute: async (): Promise<unknown> => ({ runtime: "arc" }),
    });

    await expect(
      runtime.execute({ id: "call_1", name: "arc.runtime_info", arguments: {} }, createContext(controller.signal)),
    ).resolves.toMatchObject({ status: "cancelled", error: { code: "execution_cancelled" } });
  });

  it("stops a tool that exceeds the configured time limit", async () => {
    const runtime = createRuntime({
      definition: {
        name: "arc.runtime_info",
        description: "Return runtime information.",
        permission: "none",
        parameters: { type: "object" },
      },
      execute: async (): Promise<unknown> => new Promise<never>(() => undefined),
    });

    await expect(
      runtime.execute({ id: "call_1", name: "arc.runtime_info", arguments: {} }, createContext()),
    ).resolves.toMatchObject({ status: "timed_out", error: { code: "execution_timed_out" } });
  });
});
