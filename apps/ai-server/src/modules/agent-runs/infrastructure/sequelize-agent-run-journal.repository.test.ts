import type { AgentRun } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ArcDatabase } from "../../../database/database.types.js";
import { SequelizeAgentRunJournalRepository } from "./sequelize-agent-run-journal.repository.js";

describe("SequelizeAgentRunJournalRepository", () => {
  it("stores and reloads validated task-run snapshots", async () => {
    const findAll = vi.fn(() => Promise.resolve([{ snapshot: run() }]));
    const upsert = vi.fn(() => Promise.resolve());
    const repository = new SequelizeAgentRunJournalRepository({
      models: { agentRunJournals: { findAll, upsert } },
    } as unknown as ArcDatabase);

    await expect(repository.list()).resolves.toEqual([run()]);
    await repository.save(run());
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: run().id, projectId: run().projectId, status: "completed" }),
    );
  });
});

function run(): AgentRun {
  return {
    activeStepId: null,
    budget: { maxRepairAttempts: 2, maxToolCalls: 3, repairAttempts: 0, toolCallsUsed: 0 },
    createdAt: "2026-08-05T00:00:00.000Z",
    goal: "Improve categories",
    id: "5efae680-025a-41ff-8133-482c50538bd4",
    planId: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
    projectId: "be1ce7ce-b4a6-419c-a6a2-38f499459c75",
    status: "completed",
    steps: [
      {
        artifacts: [],
        attempt: 1,
        checkpoint: "Inspection complete.",
        status: "completed",
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
