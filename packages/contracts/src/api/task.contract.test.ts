import { describe, expect, it } from "vitest";

import { TaskProposalApprovalRequestSchema, TaskProposalApprovalSchema } from "./task.contract.js";

describe("task contracts", () => {
  it("requires explicit command confirmation", () => {
    expect(TaskProposalApprovalRequestSchema.parse({ confirmed: true })).toEqual({ confirmed: true });
    expect(TaskProposalApprovalRequestSchema.safeParse({ confirmed: false }).success).toBe(false);
  });

  it("keeps approval classes explicit", () => {
    expect(TaskProposalApprovalSchema.parse({ kind: "git_mutation", required: true })).toEqual({
      kind: "git_mutation",
      required: true,
    });
  });
});
