import { describe, expect, it } from "vitest";

import { evaluationSuites, runEvaluationSuites } from "./evaluation-runner.js";

describe("evaluation runner", () => {
  it("runs the five deterministic workflow suites within their budgets", async () => {
    let time = 0;
    const report = await runEvaluationSuites(
      () => {
        time += 25;
        return Promise.resolve();
      },
      () => time,
    );

    expect(evaluationSuites.map((suite) => suite.id)).toEqual(["retrieval", "completion", "edit", "tool", "agent"]);
    expect(report).toMatchObject({ durationMs: 125, maxDurationMs: 55_000, passed: true });
    expect(report.suites.every((suite) => suite.status === "passed")).toBe(true);
  });

  it("reports test failures and exhausted timing budgets", async () => {
    let time = 0;
    const report = await runEvaluationSuites(
      (suite) => {
        time += suite.id === "retrieval" ? 10_001 : 1;
        if (suite.id === "completion") {
          return Promise.reject(new Error("fixture failed"));
        }
        return Promise.resolve();
      },
      () => time,
    );

    expect(report.passed).toBe(false);
    expect(report.suites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "retrieval", status: "budget_exceeded" }),
        expect.objectContaining({ id: "completion", status: "failed" }),
      ]),
    );
  });
});
