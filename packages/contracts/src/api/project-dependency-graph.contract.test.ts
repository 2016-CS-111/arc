import { describe, expect, it } from "vitest";

import {
  ProjectDependencyGraphQuerySchema,
  ProjectDependencyGraphResponseSchema,
} from "./project-dependency-graph.contract.js";

describe("project dependency graph contracts", () => {
  it("normalizes URL query values and applies bounded defaults", () => {
    expect(
      ProjectDependencyGraphQuerySchema.parse({
        dependencyKind: "require,static_import,require",
        includeBindings: "true",
        path: "src/main.ts",
        resolutionKind: ["unresolved", "local"],
      }),
    ).toEqual({
      dependencyKind: ["static_import", "require"],
      depth: 1,
      direction: "outgoing",
      includeBindings: true,
      maxEdges: 500,
      maxNodes: 100,
      path: "src/main.ts",
      resolutionKind: ["local", "unresolved"],
    });
  });

  it("rejects malformed bounds, booleans, filters, and extra query values", () => {
    expect(ProjectDependencyGraphQuerySchema.safeParse({ path: "src/main.ts", depth: 6 }).success).toBe(false);
    expect(ProjectDependencyGraphQuerySchema.safeParse({ path: "src/main.ts", includeBindings: "yes" }).success).toBe(
      false,
    );
    expect(
      ProjectDependencyGraphQuerySchema.safeParse({ path: "src/main.ts", resolutionKind: "guessed" }).success,
    ).toBe(false);
    expect(ProjectDependencyGraphQuerySchema.safeParse({ path: "src/main.ts", arbitrary: "value" }).success).toBe(
      false,
    );
  });

  it("accepts explicit nodes and edges while rejecting fake unresolved targets", () => {
    const response = {
      dependencyIndexId: "76e5ee0b-608d-4792-91c5-fd46579e74e4",
      depth: 1,
      direction: "outgoing",
      edges: [
        {
          bindings: [],
          externalPackage: null,
          id: "0ff1777d-03a4-4299-8303-4da001503f68",
          kind: "static_import",
          range: range(0, 31),
          resolutionKind: "unresolved",
          sourceFileId: "ac871053-d9f1-4f28-b022-1a18079927bb",
          sourceNodeId: "file:ac871053-d9f1-4f28-b022-1a18079927bb",
          sourcePath: "src/main.ts",
          specifier: "./missing.js",
          specifierRange: range(18, 30),
          targetNodeId: null,
          targetPath: null,
          targetSourceFileId: null,
          typeOnly: false,
          unresolvedReason: "not_found",
        },
      ],
      nodes: [
        {
          id: "file:ac871053-d9f1-4f28-b022-1a18079927bb",
          kind: "file",
          path: "src/main.ts",
          sourceFileId: "ac871053-d9f1-4f28-b022-1a18079927bb",
        },
      ],
      projectId: "03f4c07e-e890-454d-b557-17b780906ceb",
      sourceIndexRunId: "5a60683c-ded9-43fa-bac8-9ba698430d0e",
      startPath: "src/main.ts",
      truncated: { depth: false, edges: false, nodes: false },
    };

    expect(ProjectDependencyGraphResponseSchema.parse(response)).toEqual(response);
    expect(
      ProjectDependencyGraphResponseSchema.safeParse({
        ...response,
        edges: [{ ...response.edges[0], targetNodeId: "missing:target" }],
      }).success,
    ).toBe(false);
  });
});

function range(startByte: number, endByte: number) {
  return {
    endByte,
    endColumnByte: endByte,
    endLine: 0,
    startByte,
    startColumnByte: startByte,
    startLine: 0,
  };
}
