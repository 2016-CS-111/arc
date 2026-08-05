import type { ToolDefinition } from "@arc/contracts";
import { Injectable } from "@nestjs/common";

import { PermissionProfileService } from "../../security/application/permission-profile.service.js";

export interface ToolPermissionDecision {
  readonly allowed: boolean;
  readonly reason?: "approval_required" | "profile_restricted";
}

@Injectable()
export class ToolPermissionService {
  public constructor(private readonly permissionProfile: PermissionProfileService) {}

  public authorize(definition: ToolDefinition): ToolPermissionDecision {
    if (isProposalTool(definition.name) && !this.permissionProfile.allowsProposalStaging()) {
      return { allowed: false, reason: "profile_restricted" };
    }
    if (definition.permission === "none" || definition.permission === "read") {
      return { allowed: true };
    }

    return { allowed: false, reason: "approval_required" };
  }
}

function isProposalTool(name: string): boolean {
  return name === "arc.propose_edits" || name === "arc.propose_memory" || name === "arc.propose_task";
}
