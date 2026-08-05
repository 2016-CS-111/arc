import { AgentRunSchema, type AgentRun } from "@arc/contracts";

import type { ArcDatabase } from "../../../database/database.types.js";
import type { AgentRunJournalRepository } from "../application/agent-run-journal.repository.js";

export class SequelizeAgentRunJournalRepository implements AgentRunJournalRepository {
  public constructor(private readonly database: ArcDatabase) {}

  public async list(): Promise<readonly AgentRun[]> {
    const rows = await this.database.models.agentRunJournals.findAll({
      order: [
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.flatMap((row) => {
      const parsed = AgentRunSchema.safeParse(row.snapshot);
      return parsed.success ? [parsed.data] : [];
    });
  }

  public async save(run: AgentRun): Promise<void> {
    await this.database.models.agentRunJournals.upsert({
      id: run.id,
      projectId: run.projectId,
      snapshot: structuredClone(run),
      status: run.status,
    });
  }
}
