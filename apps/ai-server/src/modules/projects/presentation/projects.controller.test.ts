import type { ProjectScan, RegisterProjectResponse } from "@arc/contracts";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ProjectIgnorePolicyService } from "../application/project-ignore-policy.service.js";
import type { ProjectInventoryService } from "../application/project-inventory.service.js";
import type { ProjectRegistrationService } from "../application/project-registration.service.js";
import {
  IgnoreRulesFileTooLargeError,
  InvalidProjectPathError,
  InvalidProjectRootError,
  ProjectNotFoundError,
  ProjectScanAlreadyRunningError,
  ProjectScanFailedError,
} from "../domain/project.errors.js";
import { ProjectsController } from "./projects.controller.js";

const registration: RegisterProjectResponse = {
  created: true,
  project: {
    id: "03f4c07e-e890-454d-b557-17b780906ceb",
    name: "Arc",
    rootPath: "/workspace/arc",
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T08:00:00.000Z",
  },
};

const completedScan: ProjectScan = {
  completedAt: "2026-07-27T09:01:00.000Z",
  errorCode: null,
  fileCount: 42,
  id: "72449150-b7e9-4410-8502-10e221dcdf43",
  ignoredPathCount: 8,
  limitReasons: [],
  projectId: registration.project.id,
  skippedSymlinkCount: 1,
  startedAt: "2026-07-27T09:00:00.000Z",
  status: "completed",
  totalBytes: 1024,
};

describe("ProjectsController", () => {
  it("validates and normalizes registration input before delegating", async () => {
    const register = vi.fn(() => Promise.resolve(registration));
    const controller = createController(register);

    await expect(controller.register({ name: "  Arc  ", rootPath: "/workspace/arc" })).resolves.toEqual(registration);
    expect(register).toHaveBeenCalledWith({
      name: "Arc",
      rootPath: "/workspace/arc",
    });
  });

  it("returns stable bad-request errors for invalid payloads and roots", async () => {
    const register = vi.fn(() => Promise.reject(new InvalidProjectRootError()));
    const controller = createController(register);

    await expect(controller.register({ name: "", rootPath: "/workspace/arc" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.register({ name: "Arc", rootPath: "/missing" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("validates ignore requests before delegating to the policy service", async () => {
    const check = vi.fn(() =>
      Promise.resolve({
        ignored: true,
        kind: "directory" as const,
        path: "dist",
        projectId: registration.project.id,
        reason: {
          pattern: "dist/",
          source: "built_in_generated" as const,
          sourcePath: null,
        },
      }),
    );
    const controller = createController(vi.fn(), check);

    await expect(
      controller.checkIgnore(registration.project.id, { kind: "directory", path: "dist" }),
    ).resolves.toMatchObject({
      ignored: true,
      reason: { source: "built_in_generated" },
    });
    expect(check).toHaveBeenCalledWith(registration.project.id, { kind: "directory", path: "dist" });
    await expect(controller.checkIgnore("invalid", { kind: "file", path: "src/main.ts" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new InvalidProjectPathError(), BadRequestException],
    [new IgnoreRulesFileTooLargeError(".gitignore"), UnprocessableEntityException],
  ])("maps policy errors without leaking infrastructure details", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(
      controller.checkIgnore(registration.project.id, { kind: "file", path: "src/main.ts" }),
    ).rejects.toBeInstanceOf(expectedError);
  });

  it("starts a scan and returns the latest durable scan status", async () => {
    const scan = vi.fn(() => Promise.resolve(completedScan));
    const getLatestScan = vi.fn(() => Promise.resolve({ scan: completedScan }));
    const controller = createController(vi.fn(), vi.fn(), scan, getLatestScan);

    await expect(controller.scanInventory(registration.project.id)).resolves.toEqual(completedScan);
    await expect(controller.getLatestInventoryScan(registration.project.id)).resolves.toEqual({
      scan: completedScan,
    });
    expect(scan).toHaveBeenCalledWith(registration.project.id);
    expect(getLatestScan).toHaveBeenCalledWith(registration.project.id);
  });

  it.each([
    [new ProjectNotFoundError(registration.project.id), NotFoundException],
    [new ProjectScanAlreadyRunningError(registration.project.id), ConflictException],
    [new ProjectScanFailedError(), ServiceUnavailableException],
  ])("maps inventory errors to stable HTTP responses", async (error, expectedError) => {
    const controller = createController(
      vi.fn(),
      vi.fn(),
      vi.fn(() => Promise.reject(error)),
    );

    await expect(controller.scanInventory(registration.project.id)).rejects.toBeInstanceOf(expectedError);
  });

  it("rejects malformed inventory project identifiers", async () => {
    const controller = createController(vi.fn());

    await expect(controller.scanInventory("invalid")).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getLatestInventoryScan("invalid")).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createController(
  register: ReturnType<typeof vi.fn>,
  check: ReturnType<typeof vi.fn> = vi.fn(),
  scan: ReturnType<typeof vi.fn> = vi.fn(),
  getLatestScan: ReturnType<typeof vi.fn> = vi.fn(),
): ProjectsController {
  return new ProjectsController(
    { register } as unknown as ProjectRegistrationService,
    { check } as unknown as ProjectIgnorePolicyService,
    { getLatestScan, scan } as unknown as ProjectInventoryService,
  );
}
