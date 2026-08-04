import { describe, expect, it } from "vitest";

import { InvalidProjectPathError } from "../domain/project.errors.js";
import { ProjectPathNormalizer } from "./project-path.normalizer.js";

describe("ProjectPathNormalizer", () => {
  const normalizer = new ProjectPathNormalizer();

  it("normalizes portable project-relative paths", () => {
    expect(normalizer.normalize("./packages//api\\src/main.ts")).toBe("packages/api/src/main.ts");
  });

  it.each(["", ".", "..", "../secret", "src/../../secret", "/absolute/path", "C:\\absolute\\path", "src/\0key"])(
    "rejects a path that can escape the workspace: %s",
    (path) => {
      expect(() => normalizer.normalize(path)).toThrow(InvalidProjectPathError);
    },
  );
});
