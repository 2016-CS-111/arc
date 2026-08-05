import type { SecurityAuditEvent } from "@arc/contracts";
import type { Logger } from "@arc/shared";
import { describe, expect, it, vi } from "vitest";

import type { SecurityAuditLogRepository } from "./security-audit-log.repository.js";
import { SecurityAuditLogService } from "./security-audit-log.service.js";

describe("SecurityAuditLogService", () => {
  it("persists metadata-only audit events and bounds audit review", async () => {
    let saved: SecurityAuditEvent | undefined;
    let requestedLimit: number | undefined;
    const repository: SecurityAuditLogRepository = {
      deleteOlderThan: async () => 0,
      list: async (limit) => {
        requestedLimit = limit;
        return saved === undefined ? [] : [saved];
      },
      save: async (event) => {
        saved = event;
      },
    };
    const service = new SecurityAuditLogService(repository, logger);

    service.record({
      action: "executed",
      category: "tool",
      projectId: "c7d0da58-9f18-4d86-89d7-53c372d95472",
      requestId: "request-1",
      sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
      status: "completed",
      subjectId: "call-1",
    });

    await vi.waitFor(() => {
      expect(saved?.subjectId).toBe("call-1");
    });
    await expect(service.list(500)).resolves.toHaveLength(1);
    expect(requestedLimit).toBe(100);
  });
});

const logger: Logger = {
  debug: (): void => undefined,
  error: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
};
