import type { TaskProposal } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { TaskProposalClient } from "./TaskProposalClient.js";

describe("TaskProposalClient", () => {
  it("sends an explicit confirmation when approving a command", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response(proposal()));
    const client = new TaskProposalClient("http://127.0.0.1:7331", fetchImplementation);

    await expect(client.approve(proposal().id)).resolves.toEqual(proposal());
    expect(fetchImplementation).toHaveBeenCalledWith(
      `http://127.0.0.1:7331/task-proposals/${proposal().id}/approve`,
      expect.objectContaining({ body: JSON.stringify({ confirmed: true }), method: "POST" }),
    );
  });
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });
}

function proposal(): TaskProposal {
  return {
    approval: { kind: "standard", required: true },
    command: { args: ["run", "test"], cwd: "/workspace/project", executable: "pnpm" },
    createdAt: "2026-08-05T00:00:00.000Z",
    durationMs: null,
    exitCode: null,
    id: "f89569c8-ec41-4b89-94b0-5462cd299dd1",
    kind: "preset",
    mutates: false,
    output: "",
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    requestId: "request_1",
    sessionId: "89ea5830-8a8e-4141-a5bb-1f4a2d2b655f",
    status: "pending",
    title: "Test",
    truncated: false,
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}
