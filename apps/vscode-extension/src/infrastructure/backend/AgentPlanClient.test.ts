import type { AgentPlan } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { AgentPlanClient } from "./AgentPlanClient.js";

describe("AgentPlanClient", () => {
  it("creates and updates typed local task plans", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(plan()))
      .mockResolvedValueOnce(response({ ...plan(), goal: "Add categories and tests" }));
    const client = new AgentPlanClient("http://127.0.0.1:7331", fetchImplementation);

    const created = await client.create({ goal: "Add categories", projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75" });
    await expect(
      client.update(created.id, { goal: "Add categories and tests", steps: created.steps }),
    ).resolves.toMatchObject({
      goal: "Add categories and tests",
    });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:7331/agent-plans",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:7331/agent-plans/${created.id}`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 });
}

function plan(): AgentPlan {
  return {
    createdAt: "2026-08-05T00:00:00.000Z",
    goal: "Add categories",
    id: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    status: "draft",
    steps: [
      {
        dependsOn: [],
        description: "Inspect the current routes.",
        estimateMinutes: 5,
        id: "inspect",
        kind: "inspect",
        title: "Inspect",
      },
    ],
    totalEstimateMinutes: 5,
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}
