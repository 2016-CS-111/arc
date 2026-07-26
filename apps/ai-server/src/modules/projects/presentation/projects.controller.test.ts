import type { RegisterProjectResponse } from "@arc/contracts";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ProjectRegistrationService } from "../application/project-registration.service.js";
import { InvalidProjectRootError } from "../domain/project.errors.js";
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

describe("ProjectsController", () => {
  it("validates and normalizes registration input before delegating", async () => {
    const register = vi.fn(() => Promise.resolve(registration));
    const controller = new ProjectsController({ register } as unknown as ProjectRegistrationService);

    await expect(controller.register({ name: "  Arc  ", rootPath: "/workspace/arc" })).resolves.toEqual(registration);
    expect(register).toHaveBeenCalledWith({
      name: "Arc",
      rootPath: "/workspace/arc",
    });
  });

  it("returns stable bad-request errors for invalid payloads and roots", async () => {
    const register = vi.fn(() => Promise.reject(new InvalidProjectRootError()));
    const controller = new ProjectsController({ register } as unknown as ProjectRegistrationService);

    await expect(controller.register({ name: "", rootPath: "/workspace/arc" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.register({ name: "Arc", rootPath: "/missing" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
