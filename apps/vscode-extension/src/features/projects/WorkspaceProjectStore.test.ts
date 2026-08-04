import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStatePort } from "./WorkspaceProjectStore.js";
import { WorkspaceProjectStore } from "./WorkspaceProjectStore.js";

const project = {
  createdAt: "2026-07-27T08:00:00.000Z",
  id: "03f4c07e-e890-454d-b557-17b780906ceb",
  name: "Arc",
  rootPath: "/workspace/arc",
  updatedAt: "2026-07-27T08:00:00.000Z",
};

function createState(initial: Record<string, unknown> = {}): {
  readonly state: WorkspaceStatePort;
  readonly update: ReturnType<typeof vi.fn>;
} {
  let values = { ...initial };
  const update = vi.fn((key: string, value: unknown) => {
    values = { ...values, [key]: value };
    return Promise.resolve();
  });

  return {
    state: {
      get: (key: string): unknown => values[key],
      update,
    },
    update,
  };
}

describe("WorkspaceProjectStore", () => {
  it("stores and validates backend-owned project identities per workspace", async () => {
    const { state, update } = createState();
    const store = new WorkspaceProjectStore(state);

    await store.save("file:///workspace/arc", project);

    expect(store.get("file:///workspace/arc")).toEqual(project);
    expect(update).toHaveBeenCalledWith("arc.registeredProjects", {
      "file:///workspace/arc": project,
    });
  });

  it("ignores malformed or missing stored identities", () => {
    const { state } = createState({
      "arc.registeredProjects": {
        "file:///workspace/arc": { id: "invalid" },
      },
    });
    const store = new WorkspaceProjectStore(state);

    expect(store.get("file:///workspace/arc")).toBeUndefined();
    expect(store.get("file:///workspace/other")).toBeUndefined();
  });
});
