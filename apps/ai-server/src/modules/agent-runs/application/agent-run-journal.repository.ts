import type { AgentRun } from "@arc/contracts";

export interface AgentRunJournalRepository {
  list(): Promise<readonly AgentRun[]>;
  save(run: AgentRun): Promise<void>;
}
