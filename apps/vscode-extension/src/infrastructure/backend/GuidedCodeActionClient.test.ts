import type { EditProposal, TaskProposal } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { GuidedCodeActionClient } from "./GuidedCodeActionClient.js";

describe("GuidedCodeActionClient", () => {
  it("posts a cancellable editor action request and parses the staged response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        explanation: "Ready for review.",
        proposal: editProposal(),
        validation: taskProposal(),
      }),
    );
    const client = new GuidedCodeActionClient("http://127.0.0.1:7331", fetchImplementation);
    const controller = new AbortController();

    await expect(client.execute(request(), controller.signal)).resolves.toMatchObject({
      explanation: "Ready for review.",
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://127.0.0.1:7331/guided-actions",
      expect.objectContaining({ method: "POST", signal: controller.signal }),
    );
  });
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });
}

function request() {
  return {
    action: "simplify" as const,
    diagnostic: null,
    language: "typescript",
    path: "src/example.ts",
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    range: null,
    requestId: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
    source: "export const value = 1;",
    sourceVersion: 1,
  };
}

function editProposal(): EditProposal {
  return {
    createdAt: "2026-08-05T00:00:00.000Z",
    id: "5efae680-025a-41ff-8133-482c50538bd4",
    operations: [
      {
        after: "export const value = 1;\n",
        before: "export const value = 1;\n",
        id: "b0d0b1f4-1ee5-47b6-b8cb-c09c547902c4",
        path: "src/example.ts",
        type: "update",
      },
    ],
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    rootPath: "/workspace/project",
    sessionId: "f45dc25c-7d98-494d-a358-10d0ae3cc3ef",
    status: "pending",
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function taskProposal(): TaskProposal {
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
