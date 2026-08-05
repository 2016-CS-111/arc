import { describe, expect, it } from "vitest";

import { PermissionProfileService } from "./permission-profile.service.js";

describe("PermissionProfileService", () => {
  it("permits staging only in review mode", () => {
    expect(new PermissionProfileService("review").allowsProposalStaging()).toBe(true);
    expect(new PermissionProfileService("read_only").allowsProposalStaging()).toBe(false);
    expect(() => new PermissionProfileService("read_only").assertProposalStaging()).toThrow("read-only");
  });
});
