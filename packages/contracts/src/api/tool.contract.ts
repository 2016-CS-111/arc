import { z } from "zod";

export const ToolPermissionSchema = z.enum(["none", "read", "write", "execute"]);

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(1_000),
  permission: ToolPermissionSchema,
  parameters: z.record(z.unknown()),
});

export const ToolCallSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  arguments: z.record(z.unknown()),
});

export const ToolErrorCodeSchema = z.enum([
  "unknown_tool",
  "invalid_arguments",
  "permission_denied",
  "approval_required",
  "execution_failed",
  "execution_cancelled",
  "execution_timed_out",
  "output_limited",
  "call_limit_exceeded",
]);

export const ToolErrorSchema = z.object({
  code: ToolErrorCodeSchema,
  message: z.string().min(1),
});

export const ToolResultStatusSchema = z.enum(["completed", "rejected", "failed", "cancelled", "timed_out"]);

export const ToolResultSchema = z.object({
  callId: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  status: ToolResultStatusSchema,
  content: z.string(),
  error: ToolErrorSchema.optional(),
  truncated: z.boolean().optional(),
});

export const ToolProgressEventSchema = z.object({
  callId: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  status: z.enum(["started", "completed", "rejected", "failed", "cancelled", "timed_out"]),
});

export const ToolApprovalRequestSchema = z.object({
  approvalId: z.string().min(1).max(160),
  call: ToolCallSchema,
  permission: ToolPermissionSchema.exclude(["none"]),
});

export type ToolApprovalRequest = z.infer<typeof ToolApprovalRequestSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolError = z.infer<typeof ToolErrorSchema>;
export type ToolErrorCode = z.infer<typeof ToolErrorCodeSchema>;
export type ToolPermission = z.infer<typeof ToolPermissionSchema>;
export type ToolProgressEvent = z.infer<typeof ToolProgressEventSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type ToolResultStatus = z.infer<typeof ToolResultStatusSchema>;
