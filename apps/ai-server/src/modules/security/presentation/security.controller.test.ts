import type { SecurityAuditEvent } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import { PermissionProfileService } from "../application/permission-profile.service.js";
import type { SecurityAuditLogService } from "../application/security-audit-log.service.js";
import { SecurityController } from "./security.controller.js";

describe("SecurityController", () => {
  it("reports the active profile and exposes bounded audit review", async () => {
    const list = vi.fn(() => Promise.resolve([] as readonly SecurityAuditEvent[]));
    const controller = new SecurityController(new PermissionProfileService("read_only"), {
      list,
    } as unknown as SecurityAuditLogService);

    expect(controller.getStatus()).toEqual({ permissionProfile: "read_only" });
    await expect(controller.listAudit("4")).resolves.toEqual([]);
    expect(list).toHaveBeenCalledWith(4);
  });
});
