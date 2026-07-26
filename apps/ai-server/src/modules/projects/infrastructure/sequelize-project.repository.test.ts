import type { ModelStatic } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import type { ArcDatabase, ProjectAttributes } from "../../../database/database.types.js";
import type { ProjectModel } from "../../../database/models/project.model.js";
import { SequelizeProjectRepository } from "./sequelize-project.repository.js";

const timestamp = new Date("2026-07-27T08:00:00.000Z");

function createProject(name = "Arc"): {
  readonly project: ProjectModel;
  readonly save: ReturnType<typeof vi.fn>;
  readonly set: ReturnType<typeof vi.fn>;
} {
  let attributes: ProjectAttributes = {
    id: "03f4c07e-e890-454d-b557-17b780906ceb",
    name,
    rootPath: "/workspace/arc",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const save = vi.fn(() => Promise.resolve());
  const set = vi.fn((key: keyof ProjectAttributes, value: unknown) => {
    if (key === "name" && typeof value === "string") {
      attributes = { ...attributes, name: value };
    }
  });
  const project = {
    get: (): ProjectAttributes => attributes,
    get name(): string {
      return attributes.name;
    },
    save,
    set,
  } as unknown as ProjectModel;

  return { project, save, set };
}

function createDatabase(findOrCreate: ReturnType<typeof vi.fn>): ArcDatabase {
  return {
    sequelize: {} as ArcDatabase["sequelize"],
    models: {
      chatMessages: {} as ArcDatabase["models"]["chatMessages"],
      chatSessions: {} as ArcDatabase["models"]["chatSessions"],
      projects: { findOrCreate } as unknown as ModelStatic<ProjectModel>,
    },
  };
}

describe("SequelizeProjectRepository", () => {
  it("creates one durable project for a canonical root", async () => {
    const { project } = createProject();
    const findOrCreate = vi.fn(() => Promise.resolve([project, true]));
    const repository = new SequelizeProjectRepository(createDatabase(findOrCreate));

    await expect(repository.register({ name: "Arc", rootPath: "/workspace/arc" })).resolves.toMatchObject({
      created: true,
      project: { name: "Arc", rootPath: "/workspace/arc" },
    });
    expect(findOrCreate).toHaveBeenCalledWith({
      where: { rootPath: "/workspace/arc" },
      defaults: { name: "Arc", rootPath: "/workspace/arc" },
    });
  });

  it("reuses the project identity and refreshes a changed workspace name", async () => {
    const { project, save, set } = createProject("Old name");
    const findOrCreate = vi.fn(() => Promise.resolve([project, false]));
    const repository = new SequelizeProjectRepository(createDatabase(findOrCreate));

    await expect(repository.register({ name: "Arc", rootPath: "/workspace/arc" })).resolves.toMatchObject({
      created: false,
      project: { name: "Arc" },
    });
    expect(set).toHaveBeenCalledWith("name", "Arc");
    expect(save).toHaveBeenCalledOnce();
  });
});
