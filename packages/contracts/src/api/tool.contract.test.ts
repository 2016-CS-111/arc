import { describe, expect, it } from "vitest";

import { ToolApprovalRequestSchema, ToolCallSchema, ToolResultSchema } from "./tool.contract.js";

describe("tool contracts", () => {
  it("accepts a typed harmless tool call and result", () => {
    const call = ToolCallSchema.parse({
      id: "call_1",
      name: "arc.runtime_info",
      arguments: {},
    });

    expect(
      ToolResultSchema.parse({
        callId: call.id,
        name: call.name,
        status: "completed",
        content: '{"runtime":"arc"}',
      }),
    ).toMatchObject({ status: "completed" });
  });

  it("keeps approval requests limited to privileged permissions", () => {
    expect(
      ToolApprovalRequestSchema.safeParse({
        approvalId: "approval_1",
        call: { id: "call_1", name: "arc.runtime_info", arguments: {} },
        permission: "none",
      }).success,
    ).toBe(false);
  });
});
