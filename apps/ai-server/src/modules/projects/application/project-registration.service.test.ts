import type { RegisterProjectResponse } from "@arc/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ProjectRepository } from "./project.repository.js";
import { ProjectRegistrationService } from "./project-registration.service.js";
import type { WorkspaceRootResolver } from "./workspace-root-resolver.js";

const registration: RegisterProjectResponse = {
  created: true,
  project: {
    id: "03f4c07e-e890-454d-b557-17b780906ceb",
    name: "Arc",
    rootPath: "/canonical/arc",
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T08:00:00.000Z",
  },
};

describe("ProjectRegistrationService", () => {
  it("registers the canonical workspace directory through the repository", async () => {
    const resolveDirectory = vi.fn(() => Promise.resolve("/canonical/arc"));
    const register = vi.fn(() => Promise.resolve(registration));
    const service = new ProjectRegistrationService(
      { findById: vi.fn(), register } satisfies ProjectRepository,
      { resolveDirectory } satisfies WorkspaceRootResolver,
    );

    await expect(service.register({ name: "Arc", rootPath: "/workspace/arc" })).resolves.toEqual(registration);
    expect(resolveDirectory).toHaveBeenCalledWith("/workspace/arc");
    expect(register).toHaveBeenCalledWith({
      name: "Arc",
      rootPath: "/canonical/arc",
    });
  });
});
