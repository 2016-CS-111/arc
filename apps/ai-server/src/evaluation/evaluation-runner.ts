export interface EvaluationSuite {
  readonly id: "agent" | "completion" | "edit" | "retrieval" | "tool";
  readonly maxDurationMs: number;
  readonly testFile: string;
}

export interface EvaluationSuiteResult {
  readonly durationMs: number;
  readonly id: EvaluationSuite["id"];
  readonly status: "budget_exceeded" | "failed" | "passed";
}

export interface EvaluationReport {
  readonly durationMs: number;
  readonly maxDurationMs: number;
  readonly passed: boolean;
  readonly suites: readonly EvaluationSuiteResult[];
}

export const evaluationSuites: readonly EvaluationSuite[] = [
  {
    id: "retrieval",
    maxDurationMs: 10_000,
    testFile: "apps/ai-server/src/modules/projects/application/project-semantic-search.service.test.ts",
  },
  {
    id: "completion",
    maxDurationMs: 10_000,
    testFile: "apps/ai-server/src/modules/completions/application/code-completion.service.test.ts",
  },
  {
    id: "edit",
    maxDurationMs: 10_000,
    testFile: "apps/ai-server/src/modules/edits/application/project-edit-proposal.service.test.ts",
  },
  {
    id: "tool",
    maxDurationMs: 10_000,
    testFile: "apps/ai-server/src/modules/tools/application/tool-runtime.service.test.ts",
  },
  {
    id: "agent",
    maxDurationMs: 15_000,
    testFile: "apps/ai-server/src/modules/agent-runs/application/agent-run.service.test.ts",
  },
];

export async function runEvaluationSuites(
  execute: (suite: EvaluationSuite) => Promise<void>,
  now: () => number = () => performance.now(),
): Promise<EvaluationReport> {
  const startedAt = now();
  const suites: EvaluationSuiteResult[] = [];

  for (const suite of evaluationSuites) {
    const suiteStartedAt = now();
    try {
      await execute(suite);
      const durationMs = Math.round(now() - suiteStartedAt);
      suites.push({
        durationMs,
        id: suite.id,
        status: durationMs <= suite.maxDurationMs ? "passed" : "budget_exceeded",
      });
    } catch {
      suites.push({ durationMs: Math.round(now() - suiteStartedAt), id: suite.id, status: "failed" });
    }
  }

  const durationMs = Math.round(now() - startedAt);
  const maxDurationMs = evaluationSuites.reduce((total, suite) => total + suite.maxDurationMs, 0);
  return {
    durationMs,
    maxDurationMs,
    passed: durationMs <= maxDurationMs && suites.every((suite) => suite.status === "passed"),
    suites,
  };
}
