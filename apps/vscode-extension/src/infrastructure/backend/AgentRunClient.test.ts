import type { AgentRun, AgentRunReport } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { AgentRunClient } from "./AgentRunClient.js";

describe("AgentRunClient", () => {
  it("creates and transitions a typed task run", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(run()))
      .mockResolvedValueOnce(response({ ...run(), status: "running" }))
      .mockResolvedValueOnce(response(report()));
    const client = new AgentRunClient("http://127.0.0.1:7331", fetchImplementation);

    const created = await client.create({ planId: planId });
    await expect(client.start(created.id)).resolves.toMatchObject({ status: "running" });
    await expect(client.report(created.id)).resolves.toMatchObject({ outcome: "Task run completed." });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:7331/agent-runs",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:7331/agent-runs/${created.id}/start`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(3, `http://127.0.0.1:7331/agent-runs/${created.id}/report`);
  });
});

const planId = "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });
}

function run(): AgentRun {
  return {
    activeStepId: null,
    budget: { maxRepairAttempts: 2, maxToolCalls: 3, repairAttempts: 0, toolCallsUsed: 0 },
    createdAt: "2026-08-05T00:00:00.000Z",
    goal: "Improve categories",
    id: "5efae680-025a-41ff-8133-482c50538bd4",
    planId,
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    status: "pending",
    steps: [
      {
        artifacts: [],
        attempt: 1,
        checkpoint: null,
        status: "pending",
        step: {
          dependsOn: [],
          description: "Inspect categories.",
          estimateMinutes: 5,
          id: "inspect",
          kind: "inspect",
          title: "Inspect",
        },
        toolCallsUsed: 0,
      },
    ],
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

function report(): AgentRunReport {
  return {
    changes: [],
    outcome: "Task run completed.",
    rollbackGuidance: ["No applied Arc edit proposals are recorded."],
    run: { ...run(), status: "completed" },
    tests: [],
  };
}
