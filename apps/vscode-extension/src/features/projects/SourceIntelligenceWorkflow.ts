import type {
  ProjectDependencyIndex,
  ProjectFrameworkIndex,
  ProjectScan,
  ProjectSourceIndex,
  ProjectSymbolIndex,
} from "@arc/contracts";

export const sourceIntelligenceStages = ["inventory", "source", "symbols", "dependencies", "frameworks"] as const;

export type SourceIntelligenceStage = (typeof sourceIntelligenceStages)[number];

export interface SourceIntelligenceProgress {
  readonly index: number;
  readonly stage: SourceIntelligenceStage;
  readonly total: number;
}

export interface SourceIntelligenceRun {
  readonly dependency: ProjectDependencyIndex;
  readonly framework: ProjectFrameworkIndex;
  readonly inventory: ProjectScan;
  readonly limitedStages: readonly SourceIntelligenceStage[];
  readonly source: ProjectSourceIndex;
  readonly symbol: ProjectSymbolIndex;
}

export interface SourceIntelligenceIndexClient {
  indexProjectDependencies(projectId: string): Promise<ProjectDependencyIndex>;
  indexProjectFrameworks(projectId: string): Promise<ProjectFrameworkIndex>;
  indexProjectSource(projectId: string): Promise<ProjectSourceIndex>;
  indexProjectSymbols(projectId: string): Promise<ProjectSymbolIndex>;
  scanProject(projectId: string): Promise<ProjectScan>;
}

export class SourceIntelligenceWorkflowError extends Error {
  public constructor(
    public readonly stage: SourceIntelligenceStage,
    status: "failed" | "running",
  ) {
    super(`Arc ${stage} indexing returned ${status} instead of a completed durable result.`);
    this.name = "SourceIntelligenceWorkflowError";
  }
}

export class SourceIntelligenceWorkflow {
  public constructor(private readonly projectClient: SourceIntelligenceIndexClient) {}

  public async run(
    projectId: string,
    onProgress: (progress: SourceIntelligenceProgress) => void = () => undefined,
  ): Promise<SourceIntelligenceRun> {
    const limitedStages: SourceIntelligenceStage[] = [];

    this.report(onProgress, "inventory");
    const inventory = await this.projectClient.scanProject(projectId);
    this.validate("inventory", inventory.status, limitedStages);

    this.report(onProgress, "source");
    const source = await this.projectClient.indexProjectSource(projectId);
    this.validate("source", source.status, limitedStages);

    this.report(onProgress, "symbols");
    const symbol = await this.projectClient.indexProjectSymbols(projectId);
    this.validate("symbols", symbol.status, limitedStages);

    this.report(onProgress, "dependencies");
    const dependency = await this.projectClient.indexProjectDependencies(projectId);
    this.validate("dependencies", dependency.status, limitedStages);

    this.report(onProgress, "frameworks");
    const framework = await this.projectClient.indexProjectFrameworks(projectId);
    this.validate("frameworks", framework.status, limitedStages);

    return { dependency, framework, inventory, limitedStages, source, symbol };
  }

  private report(onProgress: (progress: SourceIntelligenceProgress) => void, stage: SourceIntelligenceStage): void {
    onProgress({
      index: sourceIntelligenceStages.indexOf(stage),
      stage,
      total: sourceIntelligenceStages.length,
    });
  }

  private validate(
    stage: SourceIntelligenceStage,
    status: "running" | "completed" | "limited" | "failed",
    limitedStages: SourceIntelligenceStage[],
  ): void {
    if (status === "failed" || status === "running") {
      throw new SourceIntelligenceWorkflowError(stage, status);
    }
    if (status === "limited") {
      limitedStages.push(stage);
    }
  }
}
