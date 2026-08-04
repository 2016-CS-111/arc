import type { ProjectScan } from "@arc/contracts";

import type {
  CompleteProjectScanInput,
  FailProjectScanInput,
  ProjectInventorySnapshot,
} from "../domain/project-inventory.types.js";

export interface ProjectInventoryRepository {
  beginScan(projectId: string): Promise<ProjectScan>;
  completeScan(input: CompleteProjectScanInput): Promise<ProjectScan>;
  failScan(input: FailProjectScanInput): Promise<ProjectScan>;
  getCurrentSnapshot(projectId: string): Promise<ProjectInventorySnapshot | null>;
  getLatestScan(projectId: string): Promise<ProjectScan | null>;
  recoverInterruptedScans(): Promise<number>;
}
