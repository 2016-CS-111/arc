import { z } from "zod";

export const PermissionProfileSchema = z.enum(["review", "read_only"]);

export const SecurityAuditEventSchema = z
  .object({
    action: z.string().min(1).max(64),
    category: z.enum(["tool", "edit", "task", "memory"]),
    createdAt: z.string().datetime(),
    id: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
    requestId: z.string().min(1).max(160).nullable(),
    sessionId: z.string().uuid().nullable(),
    status: z.string().min(1).max(32),
    subjectId: z.string().min(1).max(160),
  })
  .strict();

export const SecurityStatusSchema = z
  .object({
    permissionProfile: PermissionProfileSchema,
  })
  .strict();

export type PermissionProfile = z.infer<typeof PermissionProfileSchema>;
export type SecurityAuditEvent = z.infer<typeof SecurityAuditEventSchema>;
export type SecurityStatus = z.infer<typeof SecurityStatusSchema>;
