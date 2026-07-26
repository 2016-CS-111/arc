import { describe, expect, it } from "vitest";

import {
  CheckProjectPathRequestSchema,
  ProjectIgnoreDecisionSchema,
  ProjectRelativePathSchema,
} from "./project-ignore.contract.js";

describe("project ignore contracts", () => {
  it("accepts bounded project-relative path requests", () => {
    expect(CheckProjectPathRequestSchema.parse({ kind: "file", path: "packages/api/src/main.ts" })).toEqual({
      kind: "file",
      path: "packages/api/src/main.ts",
    });
  });

  it("validates explainable ignore decisions", () => {
    expect(
      ProjectIgnoreDecisionSchema.parse({
        ignored: true,
        kind: "directory",
        path: "packages/api/dist",
        projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
        reason: {
          pattern: "dist/",
          source: "gitignore",
          sourcePath: "packages/api/.gitignore",
        },
      }),
    ).toMatchObject({
      ignored: true,
      reason: { source: "gitignore" },
    });
  });

  it("rejects empty and oversized path values", () => {
    expect(ProjectRelativePathSchema.safeParse("").success).toBe(false);
    expect(ProjectRelativePathSchema.safeParse("x".repeat(4_097)).success).toBe(false);
  });
});
