import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Project } from "@arc/contracts";
import type { AppConfig } from "../../../config/env.js";
import { describe, expect, it } from "vitest";

import type { ProjectIgnorePolicyService } from "../../projects/application/project-ignore-policy.service.js";
import { ProjectPathNormalizer } from "../../projects/application/project-path.normalizer.js";
import type { ProjectRepository } from "../../projects/application/project.repository.js";
import { PermissionProfileService } from "../../security/application/permission-profile.service.js";
import type { SecurityAuditLogService } from "../../security/application/security-audit-log.service.js";
import { ProjectEditProposalService } from "./project-edit-proposal.service.js";

const projectId = "c7d0da58-9f18-4d86-89d7-53c372d95472";
const sessionId = "0d2e5770-f08e-48d5-871b-36bf734f535c";

describe("ProjectEditProposalService", () => {
  it("stages selected edits, applies them, and keeps a one-session undo record", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "arc-edits-"));
    await writeFile(join(rootPath, "sample.ts"), "export const value = 1;\n", "utf8");
    const service = createService(rootPath);

    try {
      const proposal = await service.propose({
        operations: [
          { content: "export const value = 2;\n", path: "sample.ts", type: "update" },
          { content: "export const added = true;\n", path: "added.ts", type: "create" },
        ],
        projectId,
        sessionId,
        signal: new AbortController().signal,
      });
      const updateOperation = proposal.operations[0];
      expect(updateOperation).toBeDefined();
      if (updateOperation === undefined) {
        throw new Error("Expected a staged update operation.");
      }

      await expect(service.approve(proposal.id, { operationIds: [updateOperation.id] })).resolves.toMatchObject({
        status: "applied",
      });
      await expect(readFile(join(rootPath, "sample.ts"), "utf8")).resolves.toBe("export const value = 2;\n");
      await expect(readFile(join(rootPath, "added.ts"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      await expect(service.undo(proposal.id)).resolves.toMatchObject({ status: "undone" });
      await expect(readFile(join(rootPath, "sample.ts"), "utf8")).resolves.toBe("export const value = 1;\n");
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });

  it("rejects a proposal when the source content changed after staging", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "arc-edits-"));
    await writeFile(join(rootPath, "sample.ts"), "export const value = 1;\n", "utf8");
    const service = createService(rootPath);

    try {
      const proposal = await service.propose({
        operations: [{ content: "export const value = 2;\n", path: "sample.ts", type: "update" }],
        projectId,
        sessionId,
        signal: new AbortController().signal,
      });
      const operation = proposal.operations[0];
      if (operation === undefined) {
        throw new Error("Expected a staged update operation.");
      }
      await writeFile(join(rootPath, "sample.ts"), "export const value = 3;\n", "utf8");

      await expect(service.approve(proposal.id, { operationIds: [operation.id] })).rejects.toThrow(
        "sample.ts changed after this proposal.",
      );
      expect(service.get(proposal.id).status).toBe("failed");
      await expect(readFile(join(rootPath, "sample.ts"), "utf8")).resolves.toBe("export const value = 3;\n");
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });

  it("does not stage a proposal that cannot fit in the preview transport", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "arc-edits-"));
    const service = createService(rootPath, 180);

    try {
      await expect(
        service.propose({
          operations: [{ content: "export const value = true;\n", path: "sample.ts", type: "create" }],
          projectId,
          sessionId,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("too large to preview safely");
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  });
});

function createService(rootPath: string, maxResultChars = 8_192): ProjectEditProposalService {
  const project: Project = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: projectId,
    name: "Fixture",
    rootPath,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const projectRepository: ProjectRepository = {
    findById: () => Promise.resolve(project),
    register: () => Promise.reject(new Error("Project registration was not expected.")),
  };
  const ignorePolicy = {
    createEvaluator: () => ({
      check: () => Promise.resolve({ ignored: false }),
    }),
  } as unknown as ProjectIgnorePolicyService;

  return new ProjectEditProposalService(
    projectRepository,
    ignorePolicy,
    new ProjectPathNormalizer(),
    {
      edits: { maxContentBytes: 32_768, maxOperations: 20 },
      tools: { maxResultChars },
    } as AppConfig,
    new PermissionProfileService("review"),
    { record: (): void => undefined } as unknown as SecurityAuditLogService,
  );
}
