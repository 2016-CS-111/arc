import { describe, expect, it } from "vitest";

import { ProjectSchema, RegisterProjectRequestSchema, RegisterProjectResponseSchema } from "./project.contract.js";

const timestamp = "2026-07-27T08:00:00.000Z";
const projectId = "03f4c07e-e890-454d-b557-17b780906ceb";

describe("project contracts", () => {
  it("normalizes a project name while preserving its filesystem path", () => {
    expect(
      RegisterProjectRequestSchema.parse({
        name: "  Arc Workspace  ",
        rootPath: "/Users/mac/Desktop/Arc Workspace ",
      }),
    ).toEqual({
      name: "Arc Workspace",
      rootPath: "/Users/mac/Desktop/Arc Workspace ",
    });
  });

  it("validates the durable registration response", () => {
    const project = ProjectSchema.parse({
      id: projectId,
      name: "Arc",
      rootPath: "/Users/mac/Desktop/arc",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(RegisterProjectResponseSchema.parse({ created: true, project })).toEqual({
      created: true,
      project,
    });
  });

  it("rejects malformed project identities and oversized roots", () => {
    expect(() =>
      ProjectSchema.parse({
        id: "not-a-uuid",
        name: "Arc",
        rootPath: "/workspace/arc",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toThrow();
    expect(() =>
      RegisterProjectRequestSchema.parse({
        name: "Arc",
        rootPath: `/${"a".repeat(4_096)}`,
      }),
    ).toThrow();
  });
});
