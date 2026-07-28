import { describe, expect, it } from "vitest";

import { ProjectFrameworkImportResolver } from "../../application/project-framework-import.resolver.js";
import type {
  AnalyzeProjectFrameworkFileInput,
  ProjectFrameworkAnalyzerLimits,
} from "../../domain/project-framework-analysis.types.js";
import type {
  ProjectFrameworkDependency,
  ProjectFrameworkDependencyBinding,
  SourceFrameworkEvidenceLimits,
} from "../../domain/project-framework.types.js";
import type { ProjectSymbolCatalogRecord } from "../../domain/project-symbol-index.types.js";
import { TreeSitterFrameworkEvidenceExtractor } from "./tree-sitter-framework-evidence.extractor.js";
import { TreeSitterNestFrameworkAnalyzer } from "./tree-sitter-nest-framework.analyzer.js";
import { TreeSitterSymbolExtractor } from "./tree-sitter-symbol.extractor.js";

const sourceFileId = "ac871053-d9f1-4f28-b022-1a18079927bb";
const relativePath = "src/app.module.ts";
const scopeKey = "a".repeat(64);
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

const nestSource = `import {
  Module as NestModule,
  Controller as HttpController,
  Get as Read,
  Post,
  Injectable,
  Inject,
} from "@nestjs/common";
import { UsersModule } from "./users.module";
import { UsersService as ServiceAlias } from "./users.service";

@Injectable()
class LocalService {}

@HttpController(["api/users", "admin/users"])
class UsersController {
  constructor(
    @Inject(ServiceAlias) private readonly service: ServiceAlias,
    @Inject("QUEUE") private readonly queue: unknown,
    private readonly local: LocalService,
  ) {}

  @Read([":id", "featured"])
  find() {}

  @Post()
  create() {}
}

@NestModule({
  imports: [UsersModule, ConfigModule.forRoot()],
  controllers: [UsersController],
  providers: [
    LocalService,
    ServiceAlias,
    { provide: "CACHE", useClass: LocalService },
  ],
  exports: [LocalService],
})
class AppModule {}
`;

describe("TreeSitterNestFrameworkAnalyzer", () => {
  it("extracts import-bound modules, controllers, providers, routes, registrations, and injections", () => {
    const result = analyze(nestSource, nestDependencies());

    expect(result.analyzerIdentity).toBe("arc-nestjs-analyzer@1");
    expect(result.entities.map((entity) => `${entity.entityKind}:${entity.name}`)).toEqual([
      "provider:LocalService",
      "controller:UsersController",
      "route:UsersController.find GET",
      "route:UsersController.create POST",
      "module:AppModule",
      "provider:UsersService",
      "provider:CACHE",
    ]);

    const controller = result.entities.find((entity) => entity.name === "UsersController");
    const getRoute = result.entities.find((entity) => entity.name === "UsersController.find GET");
    const postRoute = result.entities.find((entity) => entity.name === "UsersController.create POST");
    expect(controller).toMatchObject({
      attributes: {
        dynamicPath: false,
        kind: "nest_controller",
        paths: ["/api/users", "/admin/users"],
      },
      certainty: "declared",
      entityKind: "controller",
      framework: "nestjs",
    });
    expect(getRoute).toMatchObject({
      attributes: {
        dynamicPath: false,
        fullPaths: ["/admin/users/:id", "/admin/users/featured", "/api/users/:id", "/api/users/featured"],
        handlerName: "find",
        httpMethod: "GET",
        kind: "nest_route",
        methodPaths: ["/:id", "/featured"],
      },
      entityKind: "route",
    });
    expect(postRoute).toMatchObject({
      attributes: {
        fullPaths: ["/admin/users", "/api/users"],
        httpMethod: "POST",
      },
    });

    expect(
      result.relationships.map(
        (relationship) =>
          `${relationship.relationshipKind}:${relationship.targetName ?? "dynamic"}:${relationship.certainty}`,
      ),
    ).toEqual(
      expect.arrayContaining([
        "imports_module:UsersModule:declared",
        "imports_module:dynamic:unresolved",
        "registers_controller:UsersController:linked",
        "registers_provider:LocalService:linked",
        "registers_provider:UsersService:linked",
        "registers_provider:CACHE:linked",
        "exports_provider:LocalService:linked",
        "handles_route:UsersController.find GET:linked",
        "handles_route:UsersController.create POST:linked",
        "injects:UsersService:linked",
        "injects:QUEUE:declared",
        "injects:LocalService:linked",
      ]),
    );
    expect(
      result.relationships.find(
        (relationship) => relationship.relationshipKind === "injects" && relationship.targetName === "UsersService",
      ),
    ).toMatchObject({
      attributes: {
        kind: "nest_injection",
        parameterIndex: 0,
        parameterName: "service",
        tokenKind: "identifier",
      },
      dependencyEdgeId: "users-service-edge",
    });
    expect(result.omissions).toEqual([expect.objectContaining({ reason: "dynamic_value" })]);
    expect(
      result.relationships.find(
        (relationship) => relationship.relationshipKind === "injects" && relationship.targetName === "LocalService",
      ),
    ).toMatchObject({
      attributes: {
        kind: "nest_injection",
        parameterIndex: 2,
        parameterName: "local",
        tokenKind: "identifier",
      },
      certainty: "linked",
    });
    expect(JSON.stringify(result)).not.toContain("ConfigModule.forRoot");
    expect(result.entities.every((entity) => /^[0-9a-f]{64}$/u.test(entity.identityKey))).toBe(true);
    expect(result.relationships.every((relationship) => /^[0-9a-f]{64}$/u.test(relationship.identityKey))).toBe(true);
  });

  it("supports namespace decorators while preserving exact @nestjs/common provenance", () => {
    const source = `import * as Nest from "@nestjs/common";

@Nest.Controller("health")
class HealthController {
  @Nest.Get()
  ready() {}
}
`;
    const result = analyze(source, [dependency("@nestjs/common", "nest-edge", [binding("*", "Nest", "namespace")])]);

    expect(result.entities.map((entity) => `${entity.entityKind}:${entity.name}`)).toEqual([
      "controller:HealthController",
      "route:HealthController.ready GET",
    ]);
    expect(result.entities[1]).toMatchObject({
      attributes: { fullPaths: ["/health"], httpMethod: "GET" },
    });
  });

  it("rejects same-named local, unrelated, core-package, and type-only decorators", () => {
    const local = analyze("@Controller() class LocalController {}", []);
    const unrelated = analyze("@Controller() class OtherController {}", [
      dependency("other-package", "other-edge", [binding("Controller", "Controller")]),
    ]);
    const core = analyze("@Controller() class CoreController {}", [
      dependency("@nestjs/core", "core-edge", [binding("Controller", "Controller")]),
    ]);
    const typeOnly = analyze("@Controller() class TypeController {}", [
      {
        ...dependency("@nestjs/common", "types-edge", [binding("Controller", "Controller", "named", true)]),
        typeOnly: true,
      },
    ]);

    expect(local.entities).toEqual([]);
    expect(unrelated.entities).toEqual([]);
    expect(core.entities).toEqual([]);
    expect(typeOnly.entities).toEqual([]);
  });

  it("retains dynamic module metadata and route paths as unresolved facts", () => {
    const source = `import { Module, Controller, Get } from "@nestjs/common";

@Controller(CONFIG.path)
class DynamicController {
  @Get(routePattern())
  list() {}
}

@Module({
  imports: [...dynamicModules],
  providers: buildProviders(),
})
class DynamicModule {}
`;
    const result = analyze(source, [
      dependency("@nestjs/common", "nest-edge", [
        binding("Module", "Module"),
        binding("Controller", "Controller"),
        binding("Get", "Get"),
      ]),
    ]);

    const route = result.entities.find((entity) => entity.entityKind === "route");
    const module = result.entities.find((entity) => entity.entityKind === "module");
    expect(route).toMatchObject({
      attributes: { dynamicPath: true, fullPaths: [] },
      certainty: "unresolved",
      entityKind: "route",
    });
    expect(module).toMatchObject({
      attributes: { dynamicMetadata: false, kind: "nest_module" },
      entityKind: "module",
    });
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ certainty: "unresolved", relationshipKind: "imports_module", targetName: null }),
        expect.objectContaining({
          certainty: "unresolved",
          relationshipKind: "registers_provider",
          targetName: null,
        }),
      ]),
    );
    expect(result.omissions.every((omission) => omission.reason === "dynamic_value")).toBe(true);
  });

  it("keeps entity and relationship identities stable after unrelated source movement", () => {
    const first = analyze(nestSource, nestDependencies());
    const shifted = analyze(`const unrelated = true;\n${nestSource}`, nestDependencies());

    expect(shifted.entities.map((entity) => entity.identityKey)).toEqual(
      first.entities.map((entity) => entity.identityKey),
    );
    expect(shifted.relationships.map((relationship) => relationship.identityKey)).toEqual(
      first.relationships.map((relationship) => relationship.identityKey),
    );
  });

  it("enforces deterministic entity, relationship, and name limits", () => {
    const dependencies = nestDependencies();
    const entityLimited = analyze(nestSource, dependencies, { ...analyzerLimits, maxEntities: 2 });
    const relationshipLimited = analyze(nestSource, dependencies, {
      ...analyzerLimits,
      maxRelationships: 2,
    });
    const nameLimited = analyze(nestSource, dependencies, { ...analyzerLimits, maxNameBytes: 8 });

    expect(entityLimited.entities).toHaveLength(2);
    expect(entityLimited.omissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "entity_limit" })]),
    );
    expect(relationshipLimited.relationships).toHaveLength(2);
    expect(relationshipLimited.omissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "relationship_limit" })]),
    );
    expect(nameLimited.omissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "name_text_limit" })]),
    );
  });

  it("keeps valid Nest facts from a malformed syntax tree", () => {
    const source = `import { Controller, Get } from "@nestjs/common";
@Controller("ready")
class ReadyController {
  @Get()
  ready() {}
  broken = ;
}
`;
    const extraction = extractEvidence(source);
    const result = analyzeEvidence(source, extraction.evidence, [
      dependency("@nestjs/common", "nest-edge", [binding("Controller", "Controller"), binding("Get", "Get")]),
    ]);

    expect(extraction.hasSyntaxErrors).toBe(true);
    expect(result.entities.map((entity) => entity.entityKind)).toEqual(["controller", "route"]);
  });
});

function analyze(source: string, dependencies: readonly ProjectFrameworkDependency[], limits = analyzerLimits) {
  return analyzeEvidence(source, extractEvidence(source).evidence, dependencies, limits);
}

function analyzeEvidence(
  source: string,
  evidence: AnalyzeProjectFrameworkFileInput["evidence"],
  dependencies: readonly ProjectFrameworkDependency[],
  limits = analyzerLimits,
) {
  const input: AnalyzeProjectFrameworkFileInput = {
    dependencies,
    evidence,
    importBindings: new ProjectFrameworkImportResolver().resolve(dependencies),
    limits,
    relativePath,
    scopeKey,
    sourceFileId,
    symbols: extractSymbols(source),
  };
  return new TreeSitterNestFrameworkAnalyzer().analyze(input);
}

function extractEvidence(source: string) {
  return new TreeSitterFrameworkEvidenceExtractor().extract({
    language: "typescript",
    limits: evidenceLimits,
    source,
  });
}

function extractSymbols(source: string): readonly ProjectSymbolCatalogRecord[] {
  const result = new TreeSitterSymbolExtractor().extract({
    language: "typescript",
    limits: {
      maxNameBytes: 256,
      maxQualifiedNameBytes: 512,
      maxSymbols: 200,
    },
    source,
  });
  return result.symbols.map((symbol, index) => ({
    ...symbol,
    id: `symbol-${index.toString()}`,
    relativePath,
    sourceFileId,
  }));
}

function nestDependencies(): readonly ProjectFrameworkDependency[] {
  return [
    dependency("@nestjs/common", "nest-edge", [
      binding("Module", "NestModule"),
      binding("Controller", "HttpController"),
      binding("Get", "Read"),
      binding("Post", "Post"),
      binding("Injectable", "Injectable"),
      binding("Inject", "Inject"),
    ]),
    dependency(null, "users-module-edge", [binding("UsersModule", "UsersModule")], "./users.module"),
    dependency(null, "users-service-edge", [binding("UsersService", "ServiceAlias")], "./users.service"),
  ];
}

function dependency(
  externalPackage: string | null,
  id: string,
  bindings: readonly ProjectFrameworkDependencyBinding[],
  specifier = externalPackage ?? "./local",
): ProjectFrameworkDependency {
  return {
    bindings,
    externalPackage,
    id,
    sourceFileId,
    sourceRelativePath: relativePath,
    specifier,
    typeOnly: false,
  };
}

function binding(
  importedName: string,
  localName: string,
  kind = "named",
  typeOnly = false,
): ProjectFrameworkDependencyBinding {
  return {
    bindingKey: `${importedName}:${localName}`,
    importedName,
    kind,
    localName,
    typeOnly,
  };
}
