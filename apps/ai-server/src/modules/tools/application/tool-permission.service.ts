import type { ToolDefinition } from "@arc/contracts";
import { Injectable } from "@nestjs/common";

export interface ToolPermissionDecision {
  readonly allowed: boolean;
  readonly reason?: "approval_required";
}

@Injectable()
export class ToolPermissionService {
  public authorize(definition: ToolDefinition): ToolPermissionDecision {
    if (definition.permission === "none") {
      return { allowed: true };
    }

    return { allowed: false, reason: "approval_required" };
  }
}
