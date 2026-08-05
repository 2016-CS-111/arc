import type { SecurityAuditEvent } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ArcDatabase } from "../../../database/database.types.js";
import { SequelizeSecurityAuditLogRepository } from "./sequelize-security-audit-log.repository.js";

describe("SequelizeSecurityAuditLogRepository", () => {
  it("stores and reloads compact audit metadata", async () => {
    const create = vi.fn(() => Promise.resolve());
    const findAll = vi.fn(() =>
      Promise.resolve([
        {
          ...event(),
          createdAt: new Date(event().createdAt),
        },
      ]),
    );
    const repository = new SequelizeSecurityAuditLogRepository({
      models: { securityAuditEvents: { create, findAll } },
    } as unknown as ArcDatabase);

    await expect(repository.list(10)).resolves.toEqual([event()]);
    await repository.save(event());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ category: "task", subjectId: "proposal-1" }));
  });
});

function event(): SecurityAuditEvent {
  return {
    action: "proposed",
    category: "task",
    createdAt: "2026-08-05T00:00:00.000Z",
    id: "5efae680-025a-41ff-8133-482c50538bd4",
    projectId: "c7d0da58-9f18-4d86-89d7-53c372d95472",
    requestId: "request-1",
    sessionId: "0d2e5770-f08e-48d5-871b-36bf734f535c",
    status: "pending",
    subjectId: "proposal-1",
  };
}
