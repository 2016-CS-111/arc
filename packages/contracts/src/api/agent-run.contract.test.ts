import { describe, expect, it } from "vitest";

import { AgentRunBudgetSchema, AgentRunCreateRequestSchema } from "./agent-run.contract.js";

describe("agent run contracts", () => {
  it("accepts a plan id and bounds visible tool use", () => {
    expect(AgentRunCreateRequestSchema.parse({ planId: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee" })).toEqual({
      planId: "f40d11a0-a990-4b7c-ba6c-8bd5077b0cee",
    });
    expect(() => AgentRunBudgetSchema.parse({ maxToolCalls: 3, toolCallsUsed: 4 })).toThrow(
      "Tool-call budget cannot be exceeded.",
    );
  });
});
