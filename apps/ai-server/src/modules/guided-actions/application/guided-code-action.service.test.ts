import type { EditProposal, TaskProposal } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ChatModelPort } from "../../inference/application/chat-model.port.js";
import type { ChatModelEvent, ChatModelStatus } from "../../inference/domain/chat-model.types.js";
import type { ProjectEditProposalService } from "../../edits/application/project-edit-proposal.service.js";
import type { TaskProposalService } from "../../tasks/application/task-proposal.service.js";
import type { SendChatMessageEvent, SendChatMessageService } from "../../chat/application/send-chat-message.service.js";
import { GuidedCodeActionService } from "./guided-code-action.service.js";

const projectId = "be1ce7ce-b4a6-419c-a6a2-38f499459c75";

describe("GuidedCodeActionService", () => {
  it("keeps explain actions read-only", async () => {
    const streamChat = vi.fn(() =>
      modelEvents([{ content: "This adds two values.", type: "delta" }, { type: "completed" }]),
    );
    const service = new GuidedCodeActionService(
      { getStatus: status, streamChat } satisfies ChatModelPort,
      { stream: () => chatEvents([]) } as unknown as SendChatMessageService,
      { propose: vi.fn() } as unknown as TaskProposalService,
      editProposals(),
    );

    await expect(service.execute(request("explain"))).resolves.toEqual({
      explanation: "This adds two values.",
      proposal: null,
      validation: null,
    });
    expect(streamChat).toHaveBeenCalledTimes(1);
  });

  it("returns only a staged proposal and optional validation task for an edit action", async () => {
    const proposal = editProposal();
    const validation = taskProposal();
    const stream = vi.fn(() =>
      chatEvents([
        {
          result: {
            callId: "tool_1",
            content: JSON.stringify({ result: { available: true, proposal } }),
            name: "arc.propose_edits",
            status: "completed",
          },
          type: "tool",
        },
        { type: "completed" },
      ]),
    );
    const propose = vi.fn(() => Promise.resolve(validation));
    const service = new GuidedCodeActionService(
      { getStatus: status, streamChat: () => modelEvents([]) } satisfies ChatModelPort,
      { stream } as unknown as SendChatMessageService,
      { propose } as unknown as TaskProposalService,
      editProposals(),
    );

    await expect(service.execute(request("simplify"))).resolves.toEqual({
      explanation: "Simplify code is ready for diff review.",
      proposal,
      validation,
    });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, request: { preset: "test", type: "preset" } }),
    );
  });

  it("does not report an edit action as ready without a staged proposal", async () => {
    const service = new GuidedCodeActionService(
      { getStatus: status, streamChat: () => modelEvents([]) } satisfies ChatModelPort,
      {
        stream: () => chatEvents([{ type: "completed" }]),
      } as unknown as SendChatMessageService,
      { propose: vi.fn() } as unknown as TaskProposalService,
      editProposals(),
    );

    await expect(service.execute(request("add_tests"))).rejects.toThrow("Arc could not stage an edit proposal");
  });

  it("cancels the active generation and rejects an already staged proposal", async () => {
    const proposal = editProposal();
    let waiting: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      waiting = resolve;
    });
    const rejected = vi.fn();
    const service = new GuidedCodeActionService(
      { getStatus: status, streamChat: () => modelEvents([]) } satisfies ChatModelPort,
      {
        stream: (_input: unknown, signal: AbortSignal) =>
          cancellableChatEvents(proposal, signal, () => {
            waiting?.();
          }),
      } as unknown as SendChatMessageService,
      { propose: vi.fn() } as unknown as TaskProposalService,
      { reject: rejected } as unknown as ProjectEditProposalService,
    );

    const result = service.execute(request("simplify"));
    await ready;
    service.cancel("f40d11a0-a990-4b7c-ba6c-8bd5077b0cee");

    await expect(result).rejects.toThrow("Arc editor action was cancelled");
    expect(rejected).toHaveBeenCalledWith(proposal.id);
  });
});

function request(action: "explain" | "simplify" | "add_tests") {
  return {
    action,
    diagnostic: null,
    language: "typescript",
    path: "src/example.ts",
    projectId,
    range: { end: { character: 5, line: 0 }, start: { character: 0, line: 0 } },
    requestId: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
    source: "sum(a, b);",
    sourceVersion: 2,
  } as const;
}

function editProposal(): EditProposal {
  return {
    createdAt: "2026-08-05T00:00:00.000Z",
    id: "5efae680-025a-41ff-8133-482c50538bd4",
    operations: [
      {
        after: "export const sum = (a: number, b: number) => a + b;\n",
        before: "export const sum = (a: number, b: number) => { return a + b; };\n",
        id: "b0d0b1f4-1ee5-47b6-b8cb-c09c547902c4",
        path: "src/example.ts",
        type: "update",
      },
    ],
    projectId,
    rootPath: "/workspace/project",
    sessionId: "f45dc25c-7d98-494d-a358-10d0ae3cc3ef",
    status: "pending",
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function taskProposal(): TaskProposal {
  return {
    command: { args: ["run", "test"], cwd: "/workspace/project", executable: "pnpm" },
    createdAt: "2026-08-05T00:00:00.000Z",
    durationMs: null,
    exitCode: null,
    id: "f89569c8-ec41-4b89-94b0-5462cd299dd1",
    kind: "preset",
    mutates: false,
    output: "",
    projectId,
    requestId: "request_1",
    sessionId: "89ea5830-8a8e-4141-a5bb-1f4a2d2b655f",
    status: "pending",
    title: "Test",
    truncated: false,
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function status(): Promise<ChatModelStatus> {
  return Promise.resolve({ latencyMs: 1, model: "qwen2.5-coder:7b", status: "ready" });
}

function editProposals(): ProjectEditProposalService {
  return { reject: vi.fn() } as unknown as ProjectEditProposalService;
}

async function* modelEvents(events: readonly ChatModelEvent[]): AsyncGenerator<ChatModelEvent> {
  await Promise.resolve();
  yield* events;
}

async function* chatEvents(events: readonly SendChatMessageEvent[]): AsyncGenerator<SendChatMessageEvent> {
  await Promise.resolve();
  yield* events;
}

async function* cancellableChatEvents(
  proposal: EditProposal,
  signal: AbortSignal,
  onWaiting: () => void,
): AsyncGenerator<SendChatMessageEvent> {
  await Promise.resolve();
  yield {
    result: {
      callId: "tool_1",
      content: JSON.stringify({ result: { available: true, proposal } }),
      name: "arc.propose_edits",
      status: "completed",
    },
    type: "tool",
  };
  onWaiting();
  await new Promise<void>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("Arc editor action was cancelled.")), { once: true });
  });
}
