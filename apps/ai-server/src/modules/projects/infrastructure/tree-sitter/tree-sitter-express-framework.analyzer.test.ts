import { describe, expect, it } from "vitest";

import { ProjectFrameworkImportResolver } from "../../application/project-framework-import.resolver.js";
import type { ProjectFrameworkAnalyzerLimits } from "../../domain/project-framework-analysis.types.js";
import type {
  ProjectFrameworkDependency,
  ProjectFrameworkDependencyBinding,
  SourceFrameworkEvidenceLimits,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";
import { TreeSitterFrameworkEvidenceExtractor } from "./tree-sitter-framework-evidence.extractor.js";
import { TreeSitterExpressFrameworkAnalyzer } from "./tree-sitter-express-framework.analyzer.js";
import { TreeSitterSymbolExtractor } from "./tree-sitter-symbol.extractor.js";

const sourceFileId = "b69b14cc-0457-4f4d-b2dc-9f87baa9b1f1";
const relativePath = "src/app.ts";
const scopeKey = "b".repeat(64);
const evidenceLimits: SourceFrameworkEvidenceLimits = {
  maxCollectionEntries: 50,
  maxEvidence: 200,
  maxNameBytes: 256,
  maxStaticDepth: 12,
  maxStaticValueBytes: 16_384,
};
const analyzerLimits: ProjectFrameworkAnalyzerLimits = {
  maxEntities: 100,
  maxNameBytes: 256,
  maxRelationships: 200,
};

const expressSource = `import createExpress, { Router as CreateRouter } from "express";
import { usersRouter } from "./users.router";

const app = createExpress();
const router = CreateRouter();
function health() {}
function auth() {}
function createItem() {}

app.get(["health", "/ready"], health);
router.post("/items", createItem);
router.route("/chains").get(health).patch(createItem);
app.use("/api", router);
app.use("/users", usersRouter);
router.use(auth);
app.use((error, request, response, next) => next(error));
`;

describe("TreeSitterExpressFrameworkAnalyzer", () => {
  it("extracts verified applications, routers, routes, middleware, error middleware, and local router mounts", () => {
    const result = analyze(expressSource, expressDependencies());

    expect(result.analyzerIdentity).toBe("arc-express-analyzer@1");
    expect(result.entities.map((entity) => `${entity.entityKind}:${entity.name}`)).toEqual(
      expect.arrayContaining([
        "application:app",
        "router:router",
        "route:app.GET /health|/ready",
        "route:router.POST /items",
        "route:router.GET /chains",
        "route:router.PATCH /chains",
        "middleware:router.middleware.auth.0",
        "middleware:app.middleware.inline.0",
      ]),
    );
    expect(result.entities.find((entity) => entity.name === "app.GET /health|/ready")).toMatchObject({
      attributes: { handlerNames: ["health"], httpMethod: "GET", kind: "express_route", paths: ["/health", "/ready"] },
      certainty: "declared",
    });
    expect(result.entities.find((entity) => entity.name === "app.middleware.inline.0")).toMatchObject({
      attributes: { errorHandler: true, kind: "express_middleware", paths: ["/"] },
    });
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationshipKind: "handles_route", targetName: "router.GET /chains" }),
        expect.objectContaining({ relationshipKind: "mounts_router", targetName: "router", certainty: "linked" }),
        expect.objectContaining({
          dependencyEdgeId: "users-router-edge",
          relationshipKind: "mounts_router",
          targetName: "usersRouter",
        }),
        expect.objectContaining({ relationshipKind: "uses_middleware", targetName: "router.middleware.auth.0" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("next(error)");
  });

  it("supports namespace and CommonJS Express bindings", () => {
    const namespace = analyze(
      `import * as Express from "express"; const app = Express(); const router = Express.Router(); app.get("/ok", handler);`,
      [dependency("express", "express-edge", [binding("*", "Express", "namespace")])],
    );
    const commonJs = analyze(`const express = require("express"); const app = express(); app.get("/ok", handler);`, [
      dependency("express", "express-edge", [binding("default", "express", "commonjs_default")]),
    ]);

    expect(
      namespace.entities.filter((entity) => entity.entityKind === "application" || entity.entityKind === "router"),
    ).toHaveLength(2);
    expect(namespace.entities.some((entity) => entity.name === "app.GET /ok")).toBe(true);
    expect(commonJs.entities.some((entity) => entity.name === "app.GET /ok")).toBe(true);
  });

  it("keeps dynamic paths unresolved and rejects unrelated lookalikes", () => {
    const dynamic = analyze(
      `import express from "express"; const app = express(); app.get(routePattern, handler); app.use(["/ok", dynamicPath], handler);`,
      [dependency("express", "express-edge", [binding("default", "express", "default")])],
    );
    const unrelated = analyze(
      `const app = factory(); const router = { get() {}, use() {} }; app.get("/wrong", handler); router.use(handler);`,
      [],
    );

    const dynamicRoute = dynamic.entities.find((entity) => entity.entityKind === "route");
    const dynamicMiddleware = dynamic.entities.find((entity) => entity.entityKind === "middleware");
    expect(dynamicRoute?.certainty).toBe("unresolved");
    expect(dynamicRoute?.attributes).toMatchObject({ dynamicPath: true, paths: [] });
    expect(dynamicMiddleware?.certainty).toBe("unresolved");
    expect(dynamicMiddleware?.attributes).toMatchObject({ dynamicPath: true, paths: [] });
    expect(dynamic.omissions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "dynamic_value" })]));
    expect(unrelated.entities).toEqual([]);
    expect(unrelated.relationships).toEqual([]);
  });

  it("keeps identities stable and honors entity and relationship limits", () => {
    const first = analyze(expressSource, expressDependencies());
    const shifted = analyze(`const unrelated = true;\n${expressSource}`, expressDependencies());
    const limited = analyze(expressSource, expressDependencies(), {
      ...analyzerLimits,
      maxEntities: 2,
      maxRelationships: 2,
    });

    expect(shifted.entities.map((entity) => entity.identityKey)).toEqual(
      first.entities.map((entity) => entity.identityKey),
    );
    expect(shifted.relationships.map((relationship) => relationship.identityKey)).toEqual(
      first.relationships.map((relationship) => relationship.identityKey),
    );
    expect(limited.entities).toHaveLength(2);
    expect(limited.omissions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "entity_limit" })]));
  });
});

function analyze(source: string, dependencies: readonly ProjectFrameworkDependency[], limits = analyzerLimits) {
  return new TreeSitterExpressFrameworkAnalyzer().analyze({
    dependencies,
    evidence: new TreeSitterFrameworkEvidenceExtractor().extract({
      language: "typescript",
      limits: evidenceLimits,
      source,
    }).evidence,
    importBindings: new ProjectFrameworkImportResolver().resolve(dependencies),
    limits,
    relativePath,
    scopeKey,
    sourceFileId,
    symbols: extractSymbols(source),
  });
}

function extractSymbols(source: string): readonly ProjectSymbolCatalogRecord[] {
  return new TreeSitterSymbolExtractor()
    .extract({
      language: "typescript",
      limits: { maxNameBytes: 256, maxQualifiedNameBytes: 512, maxSymbols: 200 },
      source,
    })
    .symbols.map((symbol, index) => ({ ...symbol, id: `symbol-${index.toString()}`, relativePath, sourceFileId }));
}

function expressDependencies(): readonly ProjectFrameworkDependency[] {
  return [
    dependency("express", "express-edge", [
      binding("default", "createExpress", "default"),
      binding("Router", "CreateRouter"),
    ]),
    dependency(null, "users-router-edge", [binding("usersRouter", "usersRouter")], "./users.router"),
  ];
}

function dependency(
  externalPackage: string | null,
  id: string,
  bindings: readonly ProjectFrameworkDependencyBinding[],
  specifier = externalPackage ?? "./local",
): ProjectFrameworkDependency {
  return { bindings, externalPackage, id, sourceFileId, sourceRelativePath: relativePath, specifier, typeOnly: false };
}

function binding(importedName: string, localName: string, kind = "named"): ProjectFrameworkDependencyBinding {
  return { bindingKey: `${importedName}:${localName}`, importedName, kind, localName, typeOnly: false };
}
